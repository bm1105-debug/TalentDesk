"""
Standalone boolean query parser — no Django imports so it can be
tested with SimpleTestCase (no database required).

Supported syntax:
  term              → match any field containing term
  A AND B           → both must match
  A OR B            → either must match
  NOT term          → exclude term
  (group)           → parentheses for precedence
  A B               → implicit AND between adjacent terms
Operators are case-insensitive.
"""

import re


def _tokenize(query: str) -> list[str]:
    """Return a flat list of lowercase tokens, preserving operators and parens."""
    query = re.sub(r'\(', ' ( ', query)
    query = re.sub(r'\)', ' ) ', query)
    raw = query.split()
    result = []
    for t in raw:
        upper = t.upper()
        if upper in ('AND', 'OR', 'NOT', '(', ')'):
            result.append(upper)
        else:
            result.append(t.lower())
    return result


def has_boolean_operators(query: str) -> bool:
    """Return True if the query contains explicit boolean operators."""
    tokens = _tokenize(query)
    return any(t in ('AND', 'OR', 'NOT', '(', ')') for t in tokens)


class _Parser:
    """Recursive descent parser — produces a tuple AST."""

    def __init__(self, tokens: list[str]):
        self.tokens = tokens
        self.pos    = 0

    def _peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def _consume(self):
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def _parse_expr(self):
        left = self._parse_term()
        while True:
            nxt = self._peek()
            if nxt in ('AND', 'OR'):
                op = self._consume()
                right = self._parse_term()
                left = (op, left, right)
            elif nxt is not None and nxt not in (')', ):
                # Implicit AND between adjacent tokens
                right = self._parse_term()
                left = ('AND', left, right)
            else:
                break
        return left

    def _parse_term(self):
        if self._peek() == 'NOT':
            self._consume()
            return ('NOT', self._parse_factor())
        return self._parse_factor()

    def _parse_factor(self):
        if self._peek() == '(':
            self._consume()
            expr = self._parse_expr()
            if self._peek() == ')':
                self._consume()
            return expr
        tok = self._consume()
        return ('TERM', tok)

    def parse(self):
        if not self.tokens:
            return None
        return self._parse_expr()


def _ast_to_search_query(node):
    """Convert an AST node to a Django SearchQuery (imported lazily)."""
    from django.contrib.postgres.search import SearchQuery
    if node is None:
        return None
    kind = node[0]
    if kind == 'TERM':
        return SearchQuery(node[1], search_type='plain')
    if kind == 'NOT':
        return ~_ast_to_search_query(node[1])
    if kind == 'AND':
        return _ast_to_search_query(node[1]) & _ast_to_search_query(node[2])
    if kind == 'OR':
        return _ast_to_search_query(node[1]) | _ast_to_search_query(node[2])
    return None


def _ast_to_string(node) -> str:
    """Reconstruct a human-readable version of the AST."""
    if node is None:
        return ''
    kind = node[0]
    if kind == 'TERM':
        return node[1]
    if kind == 'NOT':
        return f'NOT {_ast_to_string(node[1])}'
    if kind == 'AND':
        return f'{_ast_to_string(node[1])} AND {_ast_to_string(node[2])}'
    if kind == 'OR':
        return f'({_ast_to_string(node[1])} OR {_ast_to_string(node[2])})'
    return ''


def parse_boolean_query(query: str):
    """
    Parse a boolean query string.

    Returns (search_query, parsed_str):
      - search_query: a Django SearchQuery object (or None if empty)
      - parsed_str:   human-readable normalised representation of the query
    """
    tokens = _tokenize(query)
    if not tokens:
        return None, ''

    ast         = _Parser(tokens).parse()
    search_query = _ast_to_search_query(ast)
    parsed_str   = _ast_to_string(ast)

    return search_query, parsed_str

from django.http import FileResponse
from rest_framework.views import APIView
from rest_framework.generics import ListCreateAPIView, DestroyAPIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from users.permissions import IsRecruiterOrAbove, IsAccountManagerOrAbove
from .models import Attachment
from .serializers import AttachmentSerializer
from .parsers import parse_resume


class AttachmentListCreateView(ListCreateAPIView):
    serializer_class = AttachmentSerializer
    permission_classes = [IsRecruiterOrAbove]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        candidate_id = self.request.query_params.get('candidate')
        qs = Attachment.objects.select_related('uploaded_by')
        if candidate_id:
            qs = qs.filter(candidate_id=candidate_id)
        return qs

    def create(self, request, *args, **kwargs):
        file = request.FILES.get('file')
        candidate_id = request.data.get('candidate')

        if not file or not candidate_id:
            return Response(
                {'detail': 'Both file and candidate are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attachment = Attachment.objects.create(
            candidate_id=candidate_id,
            file=file,
            original_name=file.name,
            file_size=file.size,
            uploaded_by=request.user,
        )
        return Response(AttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)


class AttachmentDestroyView(DestroyAPIView):
    queryset = Attachment.objects.all()
    serializer_class = AttachmentSerializer
    permission_classes = [IsAccountManagerOrAbove]


class AttachmentDownloadView(APIView):
    permission_classes = [IsRecruiterOrAbove]

    def get(self, request, pk):
        try:
            attachment = Attachment.objects.get(pk=pk)
        except Attachment.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        response = FileResponse(attachment.file.open('rb'), as_attachment=True)
        response['Content-Disposition'] = f'attachment; filename="{attachment.original_name}"'
        return response


class ResumeParseView(APIView):
    permission_classes = [IsRecruiterOrAbove]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        result = parse_resume(file, file.name)

        if 'error' in result:
            return Response({'detail': result['error']}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        return Response(result, status=status.HTTP_200_OK)

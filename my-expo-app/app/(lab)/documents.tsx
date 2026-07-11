import { lazyRoute } from '../../core/_lazyRoute';
const DocumentsScreen = lazyRoute(() => import('../../modules/documents/screens/DocumentsScreen'), 'DocumentsScreen');

export default function LabDocumentsPage() {
  return <DocumentsScreen accentColor="#2563EB" />;
}

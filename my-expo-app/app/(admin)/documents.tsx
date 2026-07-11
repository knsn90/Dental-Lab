import { lazyRoute } from '../../core/_lazyRoute';
const DocumentsScreen = lazyRoute(() => import('../../modules/documents/screens/DocumentsScreen'), 'DocumentsScreen');

export default function AdminDocumentsPage() {
  return <DocumentsScreen accentColor="#0F172A" />;
}

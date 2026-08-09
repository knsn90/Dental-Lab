import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/integrations/screens/WhatsAppSupportScreen'), 'WhatsAppSupportScreen');

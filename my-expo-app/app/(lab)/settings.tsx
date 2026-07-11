import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/settings/screens/SettingsHubScreen'), 'SettingsHubScreen');

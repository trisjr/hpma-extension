import styles from '@assets/styles/index.css?inline';
import createShadowRoot from '@utils/createShadowRoot';

import SidePanel from './SidePanel';

const root = createShadowRoot(styles);

root.render(<SidePanel />);

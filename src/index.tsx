import * as React from 'react';
import * as ReactDOM from 'react-dom';

import './index.styl';
import * as styles from './index.module.styl';

const App: React.SFC = () => <div className={styles.foo}>app123</div>;

ReactDOM.render(<App />, document.getElementById('root') as HTMLElement);

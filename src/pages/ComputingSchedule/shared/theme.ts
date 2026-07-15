import { theme } from 'antd';

/** antd 主题 token 类型，供共享的 ECharts option 构造器统一使用 */
export type ThemeToken = ReturnType<typeof theme.useToken>['token'];

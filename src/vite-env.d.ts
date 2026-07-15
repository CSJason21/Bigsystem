
/// <reference types="vite/client" />

declare module 'echarts-wordcloud';

declare module '*.css' {
  const classes: { [key: string]: string };
  export default classes;
}

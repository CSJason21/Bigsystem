import dayjs from 'dayjs';

export const DISK_COLORS = ['#1677ff', '#52c41a', '#faad14', '#722ed1'];
export const INITIAL_TIME = dayjs('2026-04-09 00:04:05').valueOf();
export const ROLLING_POINTS = 30;
export const REPLAY_STEP_SECONDS = 5;
export const FORECAST_PAST_POINTS = 10;
export const DEMO_TASK_ID = 'task-fedtrain-99943';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export const getLoadColor = (value: number) => {
  if (value >= 80) return '#ff4d4f';
  if (value >= 60) return '#faad14';
  return '#52c41a';
};

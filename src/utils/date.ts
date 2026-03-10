import dayjs from 'dayjs';

export const DATE_FORMAT = 'YYYY-MM-DD';
export const MONTH_FORMAT = 'YYYY-MM';

export const todayDate = () => dayjs().format(DATE_FORMAT);
export const currentMonth = () => dayjs().format(MONTH_FORMAT);
export const daysInMonth = (month: string) => dayjs(`${month}-01`).daysInMonth();

export const monthDateRange = (month: string) => {
  const start = dayjs(`${month}-01`).startOf('month').format(DATE_FORMAT);
  const end = dayjs(`${month}-01`).endOf('month').format(DATE_FORMAT);
  return { start, end };
};

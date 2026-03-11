import dayjs from 'dayjs';

export const DATE_FORMAT = 'YYYY-MM-DD';
export const MONTH_FORMAT = 'YYYY-MM';
export const DISPLAY_DATE_FORMAT = 'DD.MM.YYYY';
export const DISPLAY_TIME_24H_FORMAT = 'HH:mm';
export const DISPLAY_DATE_TIME_24H_FORMAT = `${DISPLAY_DATE_FORMAT} ${DISPLAY_TIME_24H_FORMAT}`;

export const todayDate = () => dayjs().format(DATE_FORMAT);
export const currentMonth = () => dayjs().format(MONTH_FORMAT);
export const daysInMonth = (month: string) => dayjs(`${month}-01`).daysInMonth();

export const monthDateRange = (month: string) => {
  const start = dayjs(`${month}-01`).startOf('month').format(DATE_FORMAT);
  const end = dayjs(`${month}-01`).endOf('month').format(DATE_FORMAT);
  return { start, end };
};

export const formatDisplayDate = (date: string) => {
  if (!dayjs(date).isValid()) {
    return date;
  }
  return dayjs(date).format(DISPLAY_DATE_FORMAT);
};

export const formatDisplayTime24H = (isoOrDateTime: string) => {
  if (!dayjs(isoOrDateTime).isValid()) {
    return isoOrDateTime;
  }
  return dayjs(isoOrDateTime).format(DISPLAY_TIME_24H_FORMAT);
};

export const formatDisplayDateTime24H = (isoOrDateTime?: string) => {
  if (!isoOrDateTime || !dayjs(isoOrDateTime).isValid()) {
    return '-';
  }
  return dayjs(isoOrDateTime).format(DISPLAY_DATE_TIME_24H_FORMAT);
};

export const normalizeDateInput = (value: string) => {
  const input = value.trim();
  if (!input) {
    return null;
  }
  const ddmmyyyyMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(input);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    const parsed = dayjs(`${year}-${month}-${day}`, DATE_FORMAT, true);
    if (parsed.isValid()) {
      return parsed.format(DATE_FORMAT);
    }
  }
  const yyyymmdd = dayjs(input);
  if (yyyymmdd.isValid()) {
    return yyyymmdd.format(DATE_FORMAT);
  }
  return null;
};

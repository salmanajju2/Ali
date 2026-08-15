export type RecentTransactionDefaults = {
  company: string;
  location: string;
  account: string;
};

export const RECENT_TRANSACTION_DEFAULTS_KEY = 'ali_recent_transaction_defaults';

export const EMPTY_RECENT_TRANSACTION_DEFAULTS: RecentTransactionDefaults = {
  company: '',
  location: '',
  account: '',
};

export const readRecentTransactionDefaults = (): RecentTransactionDefaults => {
  if (typeof window === 'undefined') return EMPTY_RECENT_TRANSACTION_DEFAULTS;

  try {
    const saved = window.localStorage.getItem(RECENT_TRANSACTION_DEFAULTS_KEY);
    if (!saved) return EMPTY_RECENT_TRANSACTION_DEFAULTS;

    const parsed = JSON.parse(saved) as Partial<RecentTransactionDefaults>;
    return {
      company: typeof parsed.company === 'string' ? parsed.company : '',
      location: typeof parsed.location === 'string' ? parsed.location : '',
      account: typeof parsed.account === 'string' ? parsed.account : '',
    };
  } catch {
    return EMPTY_RECENT_TRANSACTION_DEFAULTS;
  }
};

export const writeRecentTransactionDefaults = (defaults: RecentTransactionDefaults) => {
  try {
    window.localStorage.setItem(RECENT_TRANSACTION_DEFAULTS_KEY, JSON.stringify(defaults));
  } catch {
    // Storage can be unavailable in private browsing or restricted WebViews.
  }
};

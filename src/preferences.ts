export type SortOrder = 'asc' | 'desc'; // 'desc': mais recente primeiro, 'asc': mais antigo primeiro

export interface UserPreferences {
  operationsSortOrder: SortOrder;
  // Campos futuros de configuração podem ser adicionados aqui
  // Ex: defaultView?: 'dashboard' | 'accounts';
  // Ex: theme?: 'dark' | 'light';
  // Ex: defaultPreset?: PresetPeriod;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  operationsSortOrder: 'desc', // Por padrão, item mais recente no topo
};

const PREFERENCES_STORAGE_KEY = 'homebank_insights_preferences';

export function loadUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch (err) {
    console.warn('Erro ao carregar preferências do usuário:', err);
    return DEFAULT_PREFERENCES;
  }
}

export function saveUserPreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('Erro ao salvar preferências do usuário:', err);
  }
}

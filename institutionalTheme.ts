export const institutionalTheme = {
  colors: {
    primary: '#1A3B6C',
    secondary: '#E0E7F0',
    accent: '#28549C',
    background: '#F5F5F5',
    panelBackground: '#FFFFFF',
    text: {
      main: '#333333',
      muted: '#666666',
    },
    link: '#0044CC',
    alert: {
      background: '#FFFFCC',
      border: '#E6C200',
    },
    borders: {
      default: '#CCCCCC',
      blue: '#B0C4DE',
    },
    status: {
      online: '#22c55e',
      degraded: '#eab308',
      offline: '#ef4444',
    }
  },
  typography: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    baseSize: '14px',
  },
  shape: {
    borderRadius: '2px',
  }
} as const;

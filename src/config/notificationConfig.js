// ========================================
// 🔔 RockRider - Configuração de Notificações
// ========================================

export const NotificationConfig = {
  // Tipos de notificação disponíveis
  TYPES: {
    LIKE: 'like',
    COMMENT: 'comment',
    FOLLOW: 'follow',
    EVENT: 'event',
    MENTION: 'mention',
    SHARE: 'share',
    SYSTEM: 'system'
  },
  
  // Prioridades das notificações
  PRIORITIES: {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent'
  },
  
  // Status das notificações
  STATUS: {
    PENDING: 'pending',
    SENT: 'sent',
    READ: 'read',
    DISMISSED: 'dismissed'
  },
  
  // Configurações padrão
  DEFAULTS: {
    maxNotifications: 50,
    autoDeleteAfterDays: 30,
    batchSize: 10,
    refreshInterval: 30000, // 30 segundos
    soundEnabled: true,
    vibrationEnabled: true
  },
  
  // Templates de notificação
  TEMPLATES: {
    [this?.TYPES?.LIKE || 'like']: {
      icon: 'heart',
      color: '#FF3B30',
      sound: 'like.mp3',
      title: (fromUser) => `${fromUser.name} curtiu seu post`,
      message: (fromUser, post) => `${fromUser.name} curtiu: "${post.content.substring(0, 50)}..."`
    },
    
    [this?.TYPES?.COMMENT || 'comment']: {
      icon: 'chatbubble',
      color: '#007AFF',
      sound: 'comment.mp3',
      title: (fromUser) => `${fromUser.name} comentou`,
      message: (fromUser, post, comment) => `${fromUser.name}: "${comment.substring(0, 50)}..."`
    },
    
    [this?.TYPES?.FOLLOW || 'follow']: {
      icon: 'person-add',
      color: '#00D4AA',
      sound: 'follow.mp3',
      title: (fromUser) => `${fromUser.name} começou a te seguir`,
      message: (fromUser) => `Agora você tem mais um seguidor!`
    },
    
    [this?.TYPES?.EVENT || 'event']: {
      icon: 'calendar',
      color: '#FFD23F',
      sound: 'event.mp3',
      title: (event) => `Evento: ${event.name}`,
      message: (event, type) => {
        const messages = {
          new: 'Novo evento próximo a você!',
          reminder: 'Evento começa em breve!',
          update: 'Evento foi atualizado',
          cancelled: 'Evento foi cancelado'
        };
        return messages[type] || 'Nova informação sobre evento';
      }
    },
    
    [this?.TYPES?.MENTION || 'mention']: {
      icon: 'at',
      color: '#8B5CF6',
      sound: 'mention.mp3',
      title: (fromUser) => `${fromUser.name} te mencionou`,
      message: (fromUser, post) => `${fromUser.name} te mencionou em um post`
    },
    
    [this?.TYPES?.SHARE || 'share']: {
      icon: 'share',
      color: '#F59E0B',
      sound: 'share.mp3',
      title: (fromUser) => `${fromUser.name} compartilhou seu post`,
      message: (fromUser, post) => `Seu post foi compartilhado!`
    },
    
    [this?.TYPES?.SYSTEM || 'system']: {
      icon: 'information-circle',
      color: '#6B7280',
      sound: 'system.mp3',
      title: (title) => title,
      message: (message) => message
    }
  }
};

// Configurações de preferências do usuário
export const NotificationPreferences = {
  // Configurações padrão por tipo
  DEFAULT_SETTINGS: {
    likes: {
      enabled: true,
      sound: true,
      push: true,
      email: false,
      frequency: 'immediate' // immediate, hourly, daily
    },
    
    comments: {
      enabled: true,
      sound: true,
      push: true,
      email: true,
      frequency: 'immediate'
    },
    
    follows: {
      enabled: true,
      sound: true,
      push: true,
      email: true,
      frequency: 'immediate'
    },
    
    events: {
      enabled: true,
      sound: true,
      push: true,
      email: true,
      frequency: 'immediate'
    },
    
    mentions: {
      enabled: true,
      sound: true,
      push: true,
      email: true,
      frequency: 'immediate'
    },
    
    shares: {
      enabled: true,
      sound: false,
      push: true,
      email: false,
      frequency: 'immediate'
    },
    
    system: {
      enabled: true,
      sound: false,
      push: true,
      email: true,
      frequency: 'immediate'
    }
  },
  
  // Horários de não perturbar
  QUIET_HOURS: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'America/Sao_Paulo'
  },
  
  // Configurações de agrupamento
  GROUPING: {
    enabled: true,
    maxGroupSize: 5,
    groupingTimeWindow: 300000, // 5 minutos
    groupingRules: {
      likes: 'byPost', // agrupar curtidas do mesmo post
      comments: 'byPost', // agrupar comentários do mesmo post
      follows: 'byTimeWindow', // agrupar novos seguidores por tempo
      events: 'byLocation' // agrupar eventos por localização
    }
  }
};

// Configurações de entrega
export const NotificationDelivery = {
  // Configurações de retry
  RETRY: {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelay: 1000, // 1 segundo
    maxDelay: 30000 // 30 segundos
  },
  
  // Configurações de batch
  BATCH: {
    enabled: true,
    maxSize: 100,
    flushInterval: 5000, // 5 segundos
    maxWaitTime: 30000 // 30 segundos
  },
  
  // Configurações de prioridade
  PRIORITY_QUEUE: {
    high: {
      maxConcurrent: 10,
      timeout: 5000
    },
    normal: {
      maxConcurrent: 5,
      timeout: 10000
    },
    low: {
      maxConcurrent: 2,
      timeout: 30000
    }
  }
};

// Configurações de analytics
export const NotificationAnalytics = {
  // Métricas a serem coletadas
  METRICS: {
    DELIVERY_RATE: 'delivery_rate',
    OPEN_RATE: 'open_rate',
    CLICK_RATE: 'click_rate',
    DISMISS_RATE: 'dismiss_rate',
    RESPONSE_TIME: 'response_time'
  },
  
  // Eventos a serem rastreados
  EVENTS: {
    NOTIFICATION_SENT: 'notification_sent',
    NOTIFICATION_DELIVERED: 'notification_delivered',
    NOTIFICATION_OPENED: 'notification_opened',
    NOTIFICATION_CLICKED: 'notification_clicked',
    NOTIFICATION_DISMISSED: 'notification_dismissed',
    NOTIFICATION_FAILED: 'notification_failed'
  },
  
  // Configurações de coleta
  COLLECTION: {
    enabled: true,
    batchSize: 50,
    flushInterval: 60000, // 1 minuto
    retentionDays: 30
  }
};

// Configurações de segurança
export const NotificationSecurity = {
  // Validação de dados
  VALIDATION: {
    maxTitleLength: 100,
    maxMessageLength: 500,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxImageSize: 1024 * 1024, // 1MB
    sanitizeContent: true
  },
  
  // Rate limiting
  RATE_LIMITING: {
    perUser: {
      maxPerMinute: 10,
      maxPerHour: 100,
      maxPerDay: 500
    },
    perType: {
      likes: { maxPerMinute: 5 },
      comments: { maxPerMinute: 3 },
      follows: { maxPerMinute: 2 },
      events: { maxPerMinute: 1 }
    }
  },
  
  // Filtragem de spam
  SPAM_FILTER: {
    enabled: true,
    blockRepeatedContent: true,
    blockSuspiciousPatterns: true,
    quarantineThreshold: 0.8,
    autoBlockThreshold: 0.95
  }
};

// Configurações de internacionalização
export const NotificationI18n = {
  // Idiomas suportados
  SUPPORTED_LOCALES: ['pt-BR', 'en-US', 'es-ES'],
  
  // Idioma padrão
  DEFAULT_LOCALE: 'pt-BR',
  
  // Templates localizados
  LOCALIZED_TEMPLATES: {
    'pt-BR': {
      like: {
        title: (user) => `${user} curtiu seu post`,
        message: (user, post) => `${user} curtiu: "${post}"`
      },
      comment: {
        title: (user) => `${user} comentou`,
        message: (user, comment) => `${user}: "${comment}"`
      },
      follow: {
        title: (user) => `${user} começou a te seguir`,
        message: () => 'Agora você tem mais um seguidor!'
      }
    },
    
    'en-US': {
      like: {
        title: (user) => `${user} liked your post`,
        message: (user, post) => `${user} liked: "${post}"`
      },
      comment: {
        title: (user) => `${user} commented`,
        message: (user, comment) => `${user}: "${comment}"`
      },
      follow: {
        title: (user) => `${user} started following you`,
        message: () => 'You have a new follower!'
      }
    }
  }
};

// Configurações de teste
export const NotificationTesting = {
  // Configurações para ambiente de desenvolvimento
  DEV: {
    enabled: true,
    mockDelay: 1000,
    simulateFailures: false,
    logLevel: 'debug'
  },
  
  // Configurações para testes A/B
  AB_TESTING: {
    enabled: true,
    variants: ['default', 'compact', 'detailed'],
    trafficSplit: { default: 70, compact: 15, detailed: 15 }
  },
  
  // Dados mock para teste
  MOCK_DATA: {
    users: [
      { id: '1', name: 'João Silva', avatar: null, userType: 'fan' },
      { id: '2', name: 'Maria Santos', avatar: null, userType: 'artist' },
      { id: '3', name: 'Carlos Rock', avatar: null, userType: 'artist' }
    ],
    
    posts: [
      { id: '1', content: 'Acabei de descobrir essa banda incrível!' },
      { id: '2', content: 'Show foi sensacional ontem na Arena!' },
      { id: '3', content: 'Nova música lançada! O que acharam?' }
    ],
    
    events: [
      { id: '1', name: 'Rock in Rio 2024', artist: 'Vários Artistas' },
      { id: '2', name: 'Show Acústico', artist: 'Maria Santos' }
    ]
  }
};

// Export das configurações
export default {
  NotificationConfig,
  NotificationPreferences,
  NotificationDelivery,
  NotificationAnalytics,
  NotificationSecurity,
  NotificationI18n,
  NotificationTesting
};
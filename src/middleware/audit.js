// ========================================
// 📊 MIDDLEWARE DE AUDITORIA
// ========================================

const auditMiddleware = (action) => {
  return (req, res, next) => {
    // Adicionar dados de auditoria ao request
    req.auditData = {
      action,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date(),
      userId: req.user?.userId || null,
      method: req.method,
      url: req.originalUrl,
      body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined
    };
    
    console.log(`📊 Audit: ${action} - IP: ${req.ip} - User: ${req.user?.userId || 'Anonymous'} - ${req.method} ${req.originalUrl}`);
    next();
  };
};

// Sanitizar dados sensíveis do body para logs
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized = { ...body };
  
  // Remover campos sensíveis
  const sensitiveFields = ['password', 'newPassword', 'currentPassword', 'token'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[HIDDEN]';
    }
  });
  
  return sanitized;
};

// Middleware para logs de segurança
const securityAuditMiddleware = (req, res, next) => {
  const securityData = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date(),
    method: req.method,
    url: req.originalUrl,
    authorization: req.headers.authorization ? 'Present' : 'Absent',
    userId: req.user?.userId || null
  };
  
  // Detectar tentativas suspeitas
  const suspiciousPatterns = [
    /admin/i,
    /script/i,
    /select.*from/i,
    /union.*select/i,
    /drop.*table/i,
    /<.*script.*>/i
  ];
  
  const urlAndQuery = req.originalUrl + JSON.stringify(req.body || {});
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(urlAndQuery));
  
  if (isSuspicious) {
    console.warn(`🚨 SUSPICIOUS REQUEST DETECTED:`, {
      ip: req.ip,
      url: req.originalUrl,
      userAgent: req.headers['user-agent'],
      body: sanitizeBody(req.body)
    });
  }
  
  req.securityData = securityData;
  next();
};

// Middleware para rate limiting por usuário
const userRateLimitMiddleware = () => {
  const userRequests = new Map();
  const WINDOW_SIZE = 15 * 60 * 1000; // 15 minutos
  const MAX_REQUESTS = 200; // requests por janela
  
  return (req, res, next) => {
    const userId = req.user?.userId;
    if (!userId) return next(); // Skip para usuários não autenticados
    
    const now = Date.now();
    const windowStart = now - WINDOW_SIZE;
    
    // Limpar entradas antigas
    if (userRequests.has(userId)) {
      const userRequestTimes = userRequests.get(userId).filter(time => time > windowStart);
      userRequests.set(userId, userRequestTimes);
    } else {
      userRequests.set(userId, []);
    }
    
    const currentUserRequests = userRequests.get(userId);
    
    if (currentUserRequests.length >= MAX_REQUESTS) {
      console.warn(`⚠️ User rate limit exceeded: ${userId} - ${currentUserRequests.length} requests`);
      return res.status(429).json({
        error: 'Muitas requisições',
        message: 'Limite de requisições por usuário excedido. Tente novamente em 15 minutos.',
        retryAfter: Math.ceil(WINDOW_SIZE / 1000)
      });
    }
    
    // Adicionar requisição atual
    currentUserRequests.push(now);
    userRequests.set(userId, currentUserRequests);
    
    next();
  };
};

// Middleware para logging de ações importantes
const actionLogMiddleware = (action, level = 'info') => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      const responseData = {
        action,
        level,
        userId: req.user?.userId,
        ip: req.ip,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
        duration: Date.now() - req.startTime
      };
      
      // Log baseado no nível
      if (level === 'error' || res.statusCode >= 400) {
        console.error(`🔴 ${action}:`, responseData);
      } else if (level === 'warn' || res.statusCode >= 300) {
        console.warn(`🟡 ${action}:`, responseData);
      } else {
        console.log(`🟢 ${action}:`, responseData);
      }
      
      originalSend.call(this, data);
    };
    
    req.startTime = Date.now();
    next();
  };
};

// Middleware para adicionar timestamp de início
const timestampMiddleware = (req, res, next) => {
  req.startTime = Date.now();
  req.requestId = generateRequestId();
  next();
};

// Gerar ID único para requisição
const generateRequestId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

// Middleware para logs de performance
const performanceLogMiddleware = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - req.startTime;
    
    // Log se a requisição demorou mais que 2 segundos
    if (duration > 2000) {
      console.warn(`⏱️ SLOW REQUEST: ${req.method} ${req.originalUrl} - ${duration}ms - User: ${req.user?.userId || 'Anonymous'}`);
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  auditMiddleware,
  securityAuditMiddleware,
  userRateLimitMiddleware,
  actionLogMiddleware,
  timestampMiddleware,
  performanceLogMiddleware
};
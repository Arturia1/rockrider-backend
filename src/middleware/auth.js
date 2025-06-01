const jwt = require('jsonwebtoken');
const User = require('../models/User');
// const TokenBlacklist = require('../models/TokenBlacklist'); // Implementação futura

const auth = async (req, res, next) => {
  try {
    // Pegar token do header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Acesso negado',
        message: 'Token de autorização não fornecido',
        code: 'NO_TOKEN'
      });
    }

    // Verificar formato do token (Bearer token)
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return res.status(401).json({
        error: 'Acesso negado',
        message: 'Token inválido',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // TODO: Verificar se token está na blacklist (implementação futura)
    // const isBlacklisted = await TokenBlacklist.findOne({ token });
    // if (isBlacklisted) {
    //   console.warn(`🚫 Token blacklisted usado: ${token.substring(0, 20)}... - IP: ${req.ip}`);
    //   return res.status(401).json({
    //     error: 'Token inválido',
    //     message: 'Token foi invalidado (logout realizado)',
    //     code: 'TOKEN_BLACKLISTED'
    //   });
    // }

    // Verificar e decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rockrider_secret_key');
    
    // Verificar se token não expirou
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      return res.status(401).json({
        error: 'Token expirado',
        message: 'Faça login novamente',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    // Verificar se usuário ainda existe
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.warn(`⚠️ Token para usuário inexistente: ${decoded.userId} - IP: ${req.ip}`);
      return res.status(401).json({
        error: 'Token inválido',
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      console.warn(`🚫 Token para usuário desativado: ${user.email} - IP: ${req.ip}`);
      return res.status(401).json({
        error: 'Conta desativada',
        message: 'Sua conta foi desativada',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // Verificar se a senha foi alterada após emissão do token
    if (user.lastPasswordReset && decoded.iat) {
      const passwordResetTime = Math.floor(user.lastPasswordReset.getTime() / 1000);
      if (passwordResetTime > decoded.iat) {
        console.warn(`🔐 Token inválido após troca de senha: ${user.email} - IP: ${req.ip}`);
        return res.status(401).json({
          error: 'Token inválido',
          message: 'Faça login novamente após alteração de senha',
          code: 'PASSWORD_CHANGED'
        });
      }
    }

    // Adicionar dados do usuário ao request
    req.user = decoded;
    req.currentUser = user;
    req.authToken = token; // Para invalidação futura
    req.authTime = new Date(); // Timestamp da autenticação
    
    // Log de acesso (apenas em desenvolvimento ou para ações importantes)
    if (process.env.NODE_ENV === 'development' || req.originalUrl.includes('/auth/')) {
      console.log(`🔑 Acesso autenticado: ${user.name} (${user.email}) - ${req.method} ${req.originalUrl}`);
    }
    
    next();
  } catch (error) {
    console.error('❌ Erro na autenticação:', error);
    
    let errorResponse = {
      error: 'Erro de autenticação',
      code: 'AUTH_ERROR'
    };
    
    if (error.name === 'JsonWebTokenError') {
      console.warn(`🚫 Token malformado - IP: ${req.ip} - Token: ${req.header('Authorization')?.substring(0, 30)}...`);
      errorResponse = {
        error: 'Token inválido',
        message: 'Token malformado ou inválido',
        code: 'INVALID_TOKEN'
      };
    } else if (error.name === 'TokenExpiredError') {
      console.log(`⏰ Token expirado - IP: ${req.ip}`);
      errorResponse = {
        error: 'Token expirado',
        message: 'Faça login novamente',
        code: 'TOKEN_EXPIRED'
      };
    } else if (error.name === 'NotBeforeError') {
      errorResponse = {
        error: 'Token ainda não válido',
        message: 'Token não pode ser usado ainda',
        code: 'TOKEN_NOT_ACTIVE'
      };
    }
    
    res.status(401).json(errorResponse);
  }
};

// Middleware para verificar se é artista
const requireArtist = (req, res, next) => {
  if (req.currentUser && req.currentUser.userType === 'artist') {
    console.log(`🎤 Acesso de artista: ${req.currentUser.artistName || req.currentUser.name}`);
    next();
  } else {
    console.warn(`⚠️ Acesso negado para não-artista: ${req.currentUser?.name || 'Unknown'} - ${req.originalUrl}`);
    res.status(403).json({
      error: 'Acesso negado',
      message: 'Apenas artistas podem acessar este recurso',
      code: 'ARTIST_REQUIRED',
      userType: req.currentUser?.userType || 'unknown'
    });
  }
};

// Middleware para verificar se é fã
const requireFan = (req, res, next) => {
  if (req.currentUser && req.currentUser.userType === 'fan') {
    console.log(`❤️ Acesso de fã: ${req.currentUser.name}`);
    next();
  } else {
    console.warn(`⚠️ Acesso negado para não-fã: ${req.currentUser?.name || 'Unknown'} - ${req.originalUrl}`);
    res.status(403).json({
      error: 'Acesso negado',
      message: 'Apenas fãs podem acessar este recurso',
      code: 'FAN_REQUIRED',
      userType: req.currentUser?.userType || 'unknown'
    });
  }
};

// Middleware opcional de autenticação (não falha se não tiver token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return next();
    }

    // TODO: Verificar blacklist aqui também
    // const isBlacklisted = await TokenBlacklist.findOne({ token });
    // if (isBlacklisted) {
    //   return next();
    // }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rockrider_secret_key');
    const user = await User.findById(decoded.userId);
    
    if (user && user.isActive) {
      // Verificar se senha foi alterada
      if (user.lastPasswordReset && decoded.iat) {
        const passwordResetTime = Math.floor(user.lastPasswordReset.getTime() / 1000);
        if (passwordResetTime <= decoded.iat) {
          req.user = decoded;
          req.currentUser = user;
          req.authToken = token;
        }
      } else {
        req.user = decoded;
        req.currentUser = user;
        req.authToken = token;
      }
    }
    
    next();
  } catch (error) {
    // Continua sem autenticação se houver erro
    console.log(`🔓 Erro na autenticação opcional (continuando): ${error.message}`);
    next();
  }
};

// Middleware para verificar se é o próprio usuário ou admin
const requireOwnerOrAdmin = (req, res, next) => {
  const targetUserId = req.params.id || req.params.userId;
  const currentUserId = req.user?.userId;
  
  if (!currentUserId) {
    return res.status(401).json({
      error: 'Não autenticado',
      code: 'NOT_AUTHENTICATED'
    });
  }
  
  // Verificar se é o próprio usuário
  if (currentUserId === targetUserId) {
    return next();
  }
  
  // TODO: Verificar se é admin (implementação futura)
  // if (req.currentUser?.role === 'admin') {
  //   return next();
  // }
  
  console.warn(`⚠️ Acesso negado - usuário tentando acessar dados de outro: ${currentUserId} -> ${targetUserId}`);
  res.status(403).json({
    error: 'Acesso negado',
    message: 'Você só pode acessar seus próprios dados',
    code: 'OWNER_REQUIRED'
  });
};

// Middleware para verificar permissões de moderação (futuro)
const requireModerator = (req, res, next) => {
  // TODO: Implementar sistema de moderação
  res.status(501).json({
    error: 'Funcionalidade não implementada',
    message: 'Sistema de moderação em desenvolvimento'
  });
};

// Middleware para logging de tentativas de acesso suspeitas
const suspiciousActivityMiddleware = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Log tentativas de acesso negadas
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.warn(`🚨 Tentativa de acesso suspeita:`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        url: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        userId: req.user?.userId || 'anonymous',
        timestamp: new Date().toISOString()
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  auth,
  requireArtist,
  requireFan,
  optionalAuth,
  requireOwnerOrAdmin,
  requireModerator,
  suspiciousActivityMiddleware
};
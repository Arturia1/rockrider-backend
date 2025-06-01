const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Importar middlewares customizados
const { 
  auditMiddleware, 
  securityAuditMiddleware, 
  userRateLimitMiddleware,
  actionLogMiddleware,
  timestampMiddleware,
  performanceLogMiddleware
} = require('./src/middleware/audit');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔧 LOGS DE INICIALIZAÇÃO
console.log('\n🎸 ================================');
console.log('🚀 Iniciando RockRider Backend...');
console.log('📅 Data:', new Date().toISOString());
console.log('🌍 NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('⚙️ Porta:', PORT);
console.log('🔑 JWT_SECRET:', process.env.JWT_SECRET ? 'Configurado ✅' : 'Usando padrão ⚠️');
console.log('🗄️ MongoDB URI:', process.env.MONGODB_URI || 'mongodb://localhost:27017/rockrider');
console.log('📧 Email configurado:', process.env.EMAIL_USER ? 'Sim ✅' : 'Não ⚠️');
console.log('🎸 ================================\n');

// ========================================
// 🛡️ MIDDLEWARES DE SEGURANÇA
// ========================================

// Middleware de timestamp (primeiro de todos)
app.use(timestampMiddleware);

// Middleware de performance
app.use(performanceLogMiddleware);

// Middleware de auditoria de segurança
app.use(securityAuditMiddleware);

// Middlewares de segurança básicos
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(compression());
console.log('✅ Middlewares de segurança configurados');

// ========================================
// 🚦 RATE LIMITING
// ========================================

// Rate limiting global - mais permissivo em desenvolvimento
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Mais requests em dev
  message: {
    error: 'Rate limit excedido',
    message: 'Muitas tentativas, tente novamente em 15 minutos',
    retryAfter: 15 * 60
  },
  handler: (req, res) => {
    console.log('🚫 Rate limit global atingido para IP:', req.ip, 'Rota:', req.originalUrl);
    res.status(429).json({
      error: 'Muitas tentativas',
      message: 'Tente novamente em 15 minutos',
      retryAfter: 15 * 60
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting específico para autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === 'production' ? 10 : 50, // Mais restrito para auth
  message: {
    error: 'Muitas tentativas de login',
    message: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.',
    retryAfter: 15 * 60
  },
  handler: (req, res) => {
    console.warn('🚨 Rate limit de autenticação atingido:', {
      ip: req.ip,
      url: req.originalUrl,
      userAgent: req.headers['user-agent']
    });
    res.status(429).json({
      error: 'Muitas tentativas de autenticação',
      message: 'Tente novamente em 15 minutos',
      retryAfter: 15 * 60
    });
  }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
console.log('✅ Rate limiting configurado');

// ========================================
// 🌐 CORS E PARSING
// ========================================

// CORS
const allowedOrigins = [
  'http://localhost:19006',       // Web local
  'exp://192.168.0.8:19000',      // Expo Go app
  'https://rockrider.vercel.app', // caso use Vercel para Web
  'https://rockrider-api.onrender.com' // caso backend faça chamadas internas
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`⛔ Origem não permitida pelo CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      console.log('❌ JSON inválido recebido de IP:', req.ip);
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
console.log('✅ Body parser configurado');

// ========================================
// 🔧 MIDDLEWARE DE DEBUG (DESENVOLVIMENTO)
// ========================================

if (process.env.NODE_ENV !== 'production') {
  app.use('/api', (req, res, next) => {
    const startTime = Date.now();
    
    console.log('\n🔵 ================================');
    console.log(`📥 ${req.method} ${req.originalUrl}`);
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`🌐 IP: ${req.ip}`);
    console.log(`📱 ID: ${req.requestId}`);
    console.log(`🔑 Auth: ${req.headers.authorization ? 'Bearer ' + req.headers.authorization.substring(7, 20) + '...' : 'Ausente'}`);
    console.log(`🎯 User-Agent: ${req.headers['user-agent']?.substring(0, 50)}...`);
    
    if (req.body && Object.keys(req.body).length > 0) {
      // Sanitizar dados sensíveis nos logs
      const sanitizedBody = { ...req.body };
      const sensitiveFields = ['password', 'newPassword', 'currentPassword'];
      sensitiveFields.forEach(field => {
        if (sanitizedBody[field]) {
          sanitizedBody[field] = '[HIDDEN]';
        }
      });
      console.log('📋 Body:', JSON.stringify(sanitizedBody, null, 2));
    }
    
    if (req.query && Object.keys(req.query).length > 0) {
      console.log('🔍 Query:', req.query);
    }

    if (req.params && Object.keys(req.params).length > 0) {
      console.log('📌 Params:', req.params);
    }

    // Override res.json para capturar resposta
    const originalJson = res.json;
    
    res.json = function(body) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`📤 ${res.statusCode} em ${duration}ms`);
      
      if (res.statusCode >= 400) {
        console.log('❌ Resposta de Erro:');
        console.log(JSON.stringify(body, null, 2));
      } else {
        console.log('✅ Resposta de Sucesso');
        if (body && typeof body === 'object') {
          // Log apenas parte da resposta para não poluir
          const preview = { ...body };
          if (preview.posts && Array.isArray(preview.posts)) {
            preview.posts = `[${preview.posts.length} posts]`;
          }
          if (preview.users && Array.isArray(preview.users)) {
            preview.users = `[${preview.users.length} users]`;
          }
          if (preview.token) {
            preview.token = '[TOKEN_HIDDEN]';
          }
          console.log('📊 Preview:', JSON.stringify(preview, null, 2));
        }
      }
      console.log('🔵 ================================\n');
      
      return originalJson.call(this, body);
    };

    next();
  });
  console.log('🔧 Debug middleware ativado para desenvolvimento');
}

// ========================================
// 📊 MIDDLEWARE DE DADOS DE SESSÃO
// ========================================

// Middleware para capturar dados de sessão
app.use((req, res, next) => {
  req.sessionData = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    requestId: req.requestId
  };
  next();
});

// Log de requisições importantes (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/auth', (req, res, next) => {
    console.log(`🔐 Auth Request: ${req.method} ${req.originalUrl} from ${req.ip} [${req.requestId}]`);
    next();
  });
}

// ========================================
// 🗄️ CONEXÃO COM MONGODB
// ========================================

const connectDB = async () => {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rockrider';
    console.log('📍 URI:', mongoUri);
    
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB conectado com sucesso!');
    console.log('🏷️ Database:', conn.connection.db.databaseName);
    console.log('🌐 Host:', conn.connection.host);
    console.log('🔌 Port:', conn.connection.port);
    console.log('📊 ReadyState:', conn.connection.readyState, '(1 = conectado)');
    
    // Verificar collections existentes
    const collections = await conn.connection.db.listCollections().toArray();
    console.log('📚 Collections encontradas:', collections.map(c => c.name));
    
    // Contar documentos nas collections principais
    try {
      const User = require('./src/models/User');
      const Post = require('./src/models/Post');
      
      const userCount = await User.countDocuments();
      const postCount = await Post.countDocuments();
      
      console.log('👥 Total de usuários:', userCount);
      console.log('📝 Total de posts:', postCount);
      
      if (userCount === 0) {
        console.log('⚠️ Aviso: Nenhum usuário encontrado. Registre-se no app para criar dados.');
      }
      
    } catch (modelError) {
      console.log('⚠️ Não foi possível contar documentos:', modelError.message);
    }
    
  } catch (error) {
    console.error('\n❌ ================================');
    console.error('💥 ERRO ao conectar MongoDB:');
    console.error('📄 Mensagem:', error.message);
    console.error('🏷️ Tipo:', error.name);
    console.error('📚 Stack:', error.stack);
    console.error('❌ ================================\n');
    
    console.log('💡 DICAS PARA RESOLVER:');
    console.log('   1. Verifique se MongoDB está rodando:');
    console.log('      Windows: services.msc → MongoDB Server');
    console.log('      Mac: brew services start mongodb-community');
    console.log('      Linux: sudo systemctl start mongod');
    console.log('   2. Teste conexão manual: mongo --eval "db.runCommand(\'ping\')"');
    console.log('   3. Verifique a URI de conexão no .env');
    console.log('   4. Verifique permissões de rede/firewall\n');
    
    process.exit(1);
  }
};

// Conectar ao banco
connectDB();

// Listeners para eventos do MongoDB
mongoose.connection.on('error', err => {
  console.error('❌ Erro de conexão MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 MongoDB desconectado');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconectado');
});

// ========================================
// 📂 ROTAS
// ========================================

let authRoutes, userRoutes, postRoutes, eventRoutes;

try {
  console.log('📂 Carregando rotas...');
  
  authRoutes = require('./src/routes/auth');
  console.log('✅ Rotas de auth carregadas');
  
  userRoutes = require('./src/routes/users');
  console.log('✅ Rotas de users carregadas');
  
  postRoutes = require('./src/routes/posts');
  console.log('✅ Rotas de posts carregadas');
  
  eventRoutes = require('./src/routes/events');
  console.log('✅ Rotas de events carregadas');
  
} catch (error) {
  console.error('\n❌ ================================');
  console.error('💥 ERRO ao carregar rotas:');
  console.error('📄 Mensagem:', error.message);
  console.error('📚 Stack:', error.stack);
  console.error('❌ ================================\n');
  
  console.log('💡 Verifique se todos os arquivos de rota existem em src/routes/');
  process.exit(1);
}

// Aplicar middleware de rate limiting específico para usuários autenticados
app.use('/api/posts', userRateLimitMiddleware());
app.use('/api/users', userRateLimitMiddleware());
app.use('/api/events', userRateLimitMiddleware());

// Registrar rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/events', eventRoutes);

console.log('✅ Todas as rotas registradas com sucesso');

// ========================================
// 🏥 HEALTH CHECK MELHORADO
// ========================================

app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const dbStatusText = {
      0: 'Desconectado',
      1: 'Conectado', 
      2: 'Conectando',
      3: 'Desconectando'
    }[dbStatus];
    
    // Contar usuários ativos (últimas 24h)
    let activeUsers = 0;
    let totalUsers = 0;
    let totalPosts = 0;
    let dbTestSuccess = false;
    
    try {
      const User = require('./src/models/User');
      const Post = require('./src/models/Post');
      
      totalUsers = await User.countDocuments({ isActive: true });
      totalPosts = await Post.countDocuments({ isActive: true });
      
      // Simular usuários ativos (em uma implementação real, seria baseado em lastLoginAt)
      activeUsers = Math.floor(totalUsers * 0.3); // 30% dos usuários como "ativos"
      
      dbTestSuccess = true;
      
    } catch (dbError) {
      console.log('⚠️ Health check - erro ao acessar collections:', dbError.message);
    }
    
    const healthData = {
      message: '🎸 RockRider API está funcionando!',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`,
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        usage: `${Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)}%`
      },
      database: {
        status: dbStatusText,
        connected: dbStatus === 1,
        testSuccess: dbTestSuccess
      },
      stats: {
        totalUsers: totalUsers,
        activeUsers: activeUsers,
        totalPosts: totalPosts,
        environment: process.env.NODE_ENV || 'development'
      },
      auth: {
        jwtConfigured: !!process.env.JWT_SECRET,
        tokenExpiry: '7 days',
        rateLimitingActive: true
      },
      features: {
        emailService: !!process.env.EMAIL_USER,
        passwordReset: true,
        userRegistration: true,
        postManagement: true,
        eventManagement: true
      },
      version: '1.0.0'
    };
    
    console.log('💚 Health check executado com sucesso');
    res.json(healthData);
    
  } catch (error) {
    console.log('💔 Health check falhou:', error.message);
    res.status(500).json({ 
      message: '💔 API com problemas',
      error: error.message,
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime())}s`
    });
  }
});

// ========================================
// 🔍 ROTA PARA ESTATÍSTICAS (DESENVOLVIMENTO)
// ========================================

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/stats', async (req, res) => {
    try {
      const User = require('./src/models/User');
      const Post = require('./src/models/Post');
      
      const userStats = await User.aggregate([
        { $group: { _id: '$userType', count: { $sum: 1 } } }
      ]);
      
      const postStats = await Post.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]);
      
      res.json({
        users: userStats,
        posts: postStats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// ========================================
// 🚫 MIDDLEWARE PARA ROTAS NÃO ENCONTRADAS
// ========================================

app.use('*', (req, res) => {
  console.log(`🔍 Rota não encontrada: ${req.method} ${req.originalUrl} - IP: ${req.ip} [${req.requestId}]`);
  res.status(404).json({ 
    error: 'Rota não encontrada',
    message: `${req.method} ${req.originalUrl} não existe nesta API`,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/register', 
      'GET /api/posts/feed',
      'POST /api/posts',
      'GET /api/users/search',
      'GET /api/events'
    ]
  });
});

// ========================================
// 🚨 MIDDLEWARE GLOBAL DE TRATAMENTO DE ERROS
// ========================================

app.use((err, req, res, next) => {
  console.error('\n🚨 ================================');
  console.error('❌ ERRO GLOBAL CAPTURADO:');
  console.error('📍 URL:', req.method, req.originalUrl);
  console.error('📱 Request ID:', req.requestId);
  console.error('👤 User ID:', req.user?.userId || 'Não autenticado');
  console.error('👤 User Name:', req.currentUser?.name || 'N/A');
  console.error('🌐 IP:', req.ip);
  console.error('🔑 Auth Header:', req.headers.authorization ? 'Presente' : 'Ausente');
  console.error('⏰ Timestamp:', new Date().toISOString());
  console.error('\n💥 DETALHES DO ERRO:');
  console.error('📄 Mensagem:', err.message);
  console.error('🏷️ Tipo:', err.name);
  console.error('🔢 Código:', err.code);
  console.error('📚 Stack Trace:');
  console.error(err.stack);
  console.error('🚨 ================================\n');
  
  // Tratamento específico por tipo de erro
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Dados inválidos',
      message: 'Erro de validação dos dados enviados',
      requestId: req.requestId,
      details: Object.values(err.errors).map(e => ({
        field: e.path,
        message: e.message,
        value: e.value
      }))
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido',
      message: 'Token JWT malformado ou inválido. Faça login novamente.',
      code: 'INVALID_TOKEN',
      requestId: req.requestId
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado',
      message: 'Sua sessão expirou. Faça login novamente.',
      code: 'TOKEN_EXPIRED',
      requestId: req.requestId
    });
  }
  
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({
      error: 'ID inválido',
      message: 'Formato de ID MongoDB inválido',
      requestId: req.requestId
    });
  }
  
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json({
      error: 'Dados duplicados',
      message: `${field} já está em uso`,
      requestId: req.requestId
    });
  }

  if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    return res.status(503).json({
      error: 'Problema de conexão com banco de dados',
      message: 'Tente novamente em alguns instantes',
      requestId: req.requestId
    });
  }

  // Erro genérico 500
  res.status(err.status || 500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado no servidor',
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      type: err.name,
      stack: err.stack.split('\n').slice(0, 5) // Primeiras 5 linhas do stack
    })
  });
});

// ========================================
// 🚀 INICIAR SERVIDOR
// ========================================

const server = app.listen(PORT, () => {
  console.log('\n🎉 ================================');
  console.log('🚀 RockRider Backend Online!');
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
  console.log(`📊 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`🔧 Debug: ${process.env.NODE_ENV !== 'production' ? 'ATIVADO' : 'DESATIVADO'}`);
  console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Conectado ✅' : 'Problema ❌'}`);
  console.log(`⏰ Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
  console.log('🎉 ================================\n');
  
  console.log('💡 RECURSOS DISPONÍVEIS:');
  console.log('   • Health Check: http://localhost:' + PORT + '/api/health');
  console.log('   • Autenticação com logout melhorado');
  console.log('   • Rate limiting inteligente');
  console.log('   • Auditoria de segurança');
  console.log('   • Logs detalhados de performance');
  console.log('   • Middleware de detecção de atividade suspeita\n');
});

// ========================================
// 🛑 GRACEFUL SHUTDOWN
// ========================================

const gracefulShutdown = (signal) => {
  console.log(`\n🛑 ${signal} recebido. Iniciando shutdown gracioso...`);
  
  server.close(async (err) => {
    if (err) {
      console.error('❌ Erro ao fechar servidor HTTP:', err);
    } else {
      console.log('📴 Servidor HTTP fechado com sucesso');
    }
    
    try {
      await mongoose.connection.close();
      console.log('🗄️ Conexão MongoDB fechada com sucesso');
    } catch (error) {
      console.error('❌ Erro ao fechar MongoDB:', error);
    }
    
    console.log('👋 RockRider Backend finalizado graciosamente');
    process.exit(err ? 1 : 0);
  });
  
  // Force close após 10 segundos
  setTimeout(() => {
    console.error('⚠️ Timeout atingido. Forçando fechamento...');
    process.exit(1);
  }, 10000);
};

// Listeners para shutdown gracioso
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Capturar erros não tratados
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n🚨 PROMISE REJEITADA NÃO TRATADA:');
  console.error('Motivo:', reason);
  console.error('Promise:', promise);
  console.error('🚨 ================================\n');
});

process.on('uncaughtException', (error) => {
  console.error('\n🚨 EXCEÇÃO NÃO CAPTURADA:');
  console.error('Erro:', error);
  console.error('Stack:', error.stack);
  console.error('🚨 ================================\n');
  process.exit(1);
});

module.exports = app;
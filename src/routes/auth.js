const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendResetPasswordEmail } = require('../utils/emailService');

const router = express.Router();

// Função para gerar JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET || 'rockrider_secret_key',
    { expiresIn: '7d' }
  );
};

// ========================================
// 🔐 ROTAS DE AUTENTICAÇÃO BÁSICA
// ========================================

// @route   POST /api/auth/register
// @desc    Registrar novo usuário
// @access  Public
router.post('/register', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome deve ter entre 2 e 50 caracteres'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Senha deve ter pelo menos 6 caracteres'),
  
  body('userType')
    .isIn(['artist', 'fan'])
    .withMessage('Tipo de usuário deve ser "artist" ou "fan"'),
  
  body('artistName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Nome artístico deve ter no máximo 100 caracteres')
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { name, email, password, userType, artistName, genres } = req.body;

    // Verificar se usuário já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'Email já está em uso'
      });
    }

    // Criar novo usuário
    const userData = {
      name,
      email,
      password,
      userType
    };

    // Adicionar campos específicos para artistas
    if (userType === 'artist') {
      userData.artistName = artistName || name;
      userData.genres = genres || [];
    }

    const user = new User(userData);
    await user.save();

    // Gerar token
    const token = generateToken(user._id);

    // Log de registro
    console.log(`✅ Novo usuário registrado: ${user.name} (${user.email}) - ${userType} - ${new Date().toISOString()}`);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      token,
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login do usuário
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  
  body('password')
    .notEmpty()
    .withMessage('Senha é obrigatória')
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Buscar usuário com senha
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        error: 'Credenciais inválidas'
      });
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Conta desativada'
      });
    }

    // Verificar senha
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Credenciais inválidas'
      });
    }

    // Gerar token
    const token = generateToken(user._id);

    // Log de login
    console.log(`🔑 Login realizado: ${user.name} (${user.email}) - IP: ${req.ip} - ${new Date().toISOString()}`);

    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout do usuário (com logs de auditoria)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    const user = req.currentUser;
    const sessionData = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    };
    
    console.log(`🚪 Logout realizado: ${user.name} (${user.email}) - IP: ${req.ip} - ${new Date().toISOString()}`);
    
    // Aqui podemos adicionar logs de auditoria futuramente
    // await LogModel.create({
    //   userId: user._id,
    //   action: 'logout',
    //   timestamp: new Date(),
    //   ip: req.ip,
    //   userAgent: req.headers['user-agent']
    // });

    // TODO: Implementar blacklist de tokens JWT (opcional)
    // await TokenBlacklist.create({
    //   token: req.authToken,
    //   userId: user._id,
    //   reason: 'logout',
    //   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias
    // });

    res.json({
      message: 'Logout realizado com sucesso',
      user: {
        name: user.name,
        email: user.email
      },
      session: sessionData
    });

  } catch (error) {
    console.error('❌ Erro no logout:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Não foi possível processar o logout'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Obter dados do usuário logado
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('followers', 'name artistName avatar userType')
      .populate('following', 'name artistName avatar userType');

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    res.json({
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// ========================================
// 👤 ROTAS DE GERENCIAMENTO DE PERFIL
// ========================================

// @route   PUT /api/auth/profile
// @desc    Atualizar perfil do usuário
// @access  Private
router.put('/profile', auth, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome deve ter entre 2 e 50 caracteres'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio deve ter no máximo 500 caracteres'),
  
  body('artistName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Nome artístico deve ter no máximo 100 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const allowedUpdates = ['name', 'bio', 'artistName', 'genres', 'socialLinks'];
    const updates = {};

    // Filtrar apenas campos permitidos
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    console.log(`📝 Perfil atualizado: ${user.name} (${user.email}) - ${new Date().toISOString()}`);

    res.json({
      message: 'Perfil atualizado com sucesso',
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Alterar senha
// @access  Private
router.post('/change-password', auth, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Senha atual é obrigatória'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Nova senha deve ter pelo menos 6 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.userId).select('+password');
    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    // Verificar senha atual
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'Senha atual incorreta'
      });
    }

    // Atualizar senha
    user.password = newPassword;
    await user.save();

    console.log(`🔐 Senha alterada: ${user.name} (${user.email}) - ${new Date().toISOString()}`);

    // TODO: Invalidar todos os tokens existentes do usuário
    // await TokenBlacklist.updateMany(
    //   { userId: user._id },
    //   { reason: 'password_change' }
    // );

    res.json({
      message: 'Senha alterada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// ========================================
// 🔍 ROTAS DE VALIDAÇÃO
// ========================================

// @route   POST /api/auth/check-email
// @desc    Verificar disponibilidade do email
// @access  Public
router.post('/check-email', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Email inválido',
        details: errors.array()
      });
    }

    const { email } = req.body;

    // Verificar se usuário já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'Email já está em uso',
        available: false
      });
    }

    res.json({
      message: 'Email disponível',
      available: true
    });

  } catch (error) {
    console.error('Erro ao verificar email:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// ========================================
// 🔐 ROTAS DE RESET DE SENHA
// ========================================

// @route   POST /api/auth/forgot-password
// @desc    Solicitar reset de senha - verifica email e envia para a conta específica
// @access  Public
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Email inválido',
        details: errors.array()
      });
    }

    const { email } = req.body;

    console.log('🔍 Verificando se email existe:', email);

    // 1. Verificar se usuário existe no banco
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ Email não encontrado no banco:', email);
      
      // Por segurança, sempre retorna sucesso mesmo se email não existir
      // Isso evita que atacantes descobram quais emails estão cadastrados
      return res.json({
        message: 'Se este email estiver cadastrado, você receberá instruções para redefinir sua senha.',
        success: true
      });
    }

    console.log('✅ Usuário encontrado:', user.name, '(' + user.email + ')');

    // 2. Verificar se usuário está ativo
    if (!user.isActive) {
      console.log('❌ Conta desativada:', email);
      return res.status(400).json({
        error: 'Conta desativada. Entre em contato com o suporte.'
      });
    }

    // 3. Gerar token de reset (10 minutos)
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    console.log('🔑 Token gerado para:', user.email);
    console.log('⏰ Expira em: 10 minutos');

    try {
      // 4. Enviar email para O EMAIL DO USUÁRIO que esqueceu a senha
      await sendResetPasswordEmail(
        user.email,    // 📧 Email DO USUÁRIO (não email do sistema)
        user.name,     // 👤 Nome do usuário
        resetToken     // 🔑 Token único
      );

      console.log('✅ Email de reset enviado com sucesso para:', user.email);

      res.json({
        message: 'Instruções para redefinir sua senha foram enviadas para seu email.',
        success: true,
        // Informações não-sensíveis para o frontend
        info: {
          emailSent: true,
          expiresInMinutes: 10,
          sentTo: user.email.replace(/(.{2}).*(@.*)/, '$1***$2') // Mascarar email: jo***@gmail.com
        }
      });

    } catch (emailError) {
      // Se falhar ao enviar email, limpar token
      user.clearPasswordReset();
      await user.save({ validateBeforeSave: false });

      console.error('❌ Erro ao enviar email para:', user.email);
      console.error('❌ Detalhes:', emailError.message);
      
      return res.status(500).json({
        error: 'Erro ao enviar email. Tente novamente mais tarde.',
        details: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

  } catch (error) {
    console.error('❌ Erro no forgot-password:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// @route   POST /api/auth/validate-reset-token
// @desc    Validar token de reset antes de mostrar formulário
// @access  Public
router.post('/validate-reset-token', [
  body('token')
    .notEmpty()
    .withMessage('Token é obrigatório')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Token é obrigatório',
        details: errors.array()
      });
    }

    const { token } = req.body;

    // Hash do token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Buscar usuário com token válido
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Token inválido ou expirado',
        valid: false,
        message: 'Este link de redefinição é inválido ou expirou. Solicite um novo.'
      });
    }

    if (!user.isActive) {
      return res.status(400).json({
        error: 'Conta desativada',
        valid: false,
        message: 'Conta desativada. Entre em contato com o suporte.'
      });
    }

    // Calcular tempo restante
    const timeRemaining = Math.max(0, user.resetPasswordExpires - Date.now());
    const minutesRemaining = Math.floor(timeRemaining / (1000 * 60));

    res.json({
      valid: true,
      message: 'Token válido',
      user: {
        name: user.name,
        email: user.email
      },
      expiresIn: minutesRemaining
    });

  } catch (error) {
    console.error('Erro ao validar token:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      valid: false
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Redefinir senha com token
// @access  Public
router.post('/reset-password', [
  body('token')
    .notEmpty()
    .withMessage('Token de reset é obrigatório'),
  
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Nova senha deve ter pelo menos 6 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { token, newPassword } = req.body;

    // Hash do token para comparar com o banco
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Buscar usuário com token válido e não expirado
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Token inválido ou expirado',
        message: 'Solicite um novo link de redefinição de senha.'
      });
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      return res.status(400).json({
        error: 'Conta desativada. Entre em contato com o suporte.'
      });
    }

    // Atualizar senha
    user.password = newPassword;
    user.clearPasswordReset();
    await user.save();

    // Gerar novo token JWT para login automático
    const jwtToken = generateToken(user._id);

    console.log(`🔐 Senha redefinida via reset: ${user.name} (${user.email}) - ${new Date().toISOString()}`);

    res.json({
      message: 'Senha redefinida com sucesso! Você foi logado automaticamente.',
      success: true,
      token: jwtToken,
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Erro no reset-password:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// ========================================
// 🧪 ROTAS DE TESTE
// ========================================

router.get('/test-jwt', (req, res) => {
  const secret = process.env.JWT_SECRET || 'rockrider_secret_key';
  
  // Criar token de teste
  const testToken = jwt.sign({ userId: 'test123' }, secret);
  
  // Verificar token de teste
  try {
    const decoded = jwt.verify(testToken, secret);
    res.json({
      success: true,
      secret: secret,
      tokenWorks: true,
      decoded: decoded
    });
  } catch (error) {
    res.json({
      success: false,
      secret: secret,
      tokenWorks: false,
      error: error.message
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout do usuário (com logs de auditoria melhorados)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    const user = req.currentUser;
    const sessionData = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      userId: user._id,
      userName: user.name,
      userType: user.userType
    };
    
    console.log(`🚪 Logout iniciado: ${user.name} (${user.email}) - ${user.userType} - IP: ${req.ip} - ${new Date().toISOString()}`);
    
    // Aqui podemos adicionar logs de auditoria futuramente
    // await LogModel.create({
    //   userId: user._id,
    //   action: 'logout',
    //   timestamp: new Date(),
    //   ip: req.ip,
    //   userAgent: req.headers['user-agent'],
    //   success: true
    // });

    // TODO: Implementar blacklist de tokens JWT (opcional para segurança extra)
    // await TokenBlacklist.create({
    //   token: req.authToken,
    //   userId: user._id,
    //   reason: 'logout',
    //   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias
    // });

    console.log(`✅ Logout concluído com sucesso: ${user.name} (${user.email})`);

    res.json({
      success: true,
      message: 'Logout realizado com sucesso',
      user: {
        name: user.name,
        email: user.email,
        userType: user.userType
      },
      session: sessionData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro no logout:', error);
    
    // Log do erro para auditoria
    if (req.currentUser) {
      console.error(`❌ Erro no logout para ${req.currentUser.name} (${req.currentUser.email}):`, error.message);
    }
    
    // Mesmo com erro, considerar logout bem-sucedido do ponto de vista do cliente
    // Isso evita que usuários fiquem "presos" logados
    res.status(200).json({
      success: true,
      message: 'Logout processado (com avisos internos)',
      warning: 'Houve um problema interno, mas sua sessão foi encerrada',
      timestamp: new Date().toISOString()
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Atualizar perfil do usuário
// @access  Private
router.put('/profile', auth, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome deve ter entre 2 e 50 caracteres'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio deve ter no máximo 500 caracteres'),
  
  body('artistName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Nome artístico deve ter no máximo 100 caracteres'),
    
  // ✅ ADICIONADO: Validação para avatar
  body('avatar')
    .optional()
    .custom((value) => {
      if (!value) return true; // Permitir valor vazio
      try {
        new URL(value);
        return true;
      } catch (error) {
        throw new Error('Avatar deve ser uma URL válida');
      }
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    // ✅ CORRIGIDO: Incluir 'avatar' na lista de campos permitidos
    const allowedUpdates = ['name', 'bio', 'artistName', 'genres', 'socialLinks', 'avatar'];

    const updates = {};

    // Filtrar apenas campos permitidos
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    console.log(`📝 Perfil atualizado: ${user.name} (${user.email}) - ${new Date().toISOString()}`);
    
    // ✅ ADICIONADO: Log específico para avatar
    if (updates.avatar !== undefined) {
      console.log(`🖼️ Avatar ${updates.avatar ? 'atualizado' : 'removido'}: ${user.name}`);
    }

    res.json({
      message: 'Perfil atualizado com sucesso',
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

router.put('/profile', auth, [
  // ... validações
], async (req, res) => {
  try {
    console.log('🔍 BACKEND: Dados recebidos:', req.body);
    console.log('🔍 BACKEND: Usuário logado:', req.user.userId);

    const allowedUpdates = ['name', 'bio', 'artistName', 'genres', 'socialLinks', 'avatar'];
    const updates = {};

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    console.log('🔍 BACKEND: Updates filtrados:', updates);

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true, runValidators: true }
    );

    console.log('🔍 BACKEND: Usuário atualizado:', {
      id: user._id,
      name: user.name,
      avatar: user.avatar
    });

    res.json({
      message: 'Perfil atualizado com sucesso',
      user: user.toPublicJSON()
    });

  } catch (error) {
    console.error('🔍 BACKEND: Erro:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
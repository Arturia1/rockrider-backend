const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    maxlength: [50, 'Nome deve ter no máximo 50 caracteres']
  },
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email inválido']
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: [6, 'Senha deve ter pelo menos 6 caracteres'],
    select: false
  },
  userType: {
    type: String,
    enum: ['artist', 'fan'],
    required: [true, 'Tipo de usuário é obrigatório']
  },
  // ✅ GARANTIR QUE ESTE CAMPO ESTÁ DEFINIDO CORRETAMENTE:
  avatar: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        if (!v || v === '') return true; // Permitir vazio/null
        try {
          new URL(v);
          return true;
        } catch (error) {
          return false;
        }
      },
      message: 'Avatar deve ser uma URL válida'
    }
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio deve ter no máximo 500 caracteres'],
    default: ''
  },
  
  // Campos específicos para artistas
  artistName: {
    type: String,
    trim: true,
    maxlength: [100, 'Nome artístico deve ter no máximo 100 caracteres']
  },
  genres: [{
    type: String,
    enum: [
      'Rock', 'Pop', 'Hip Hop', 'Electronic', 'Jazz', 'Blues', 
      'Country', 'Reggae', 'Folk', 'Classical', 'Funk', 
      'Soul', 'R&B', 'Indie', 'Alternative', 'Metal'
    ]
  }],
  socialLinks: {
    instagram: { type: String, default: '' },
    spotify: { type: String, default: '' },
    youtube: { type: String, default: '' },
    soundcloud: { type: String, default: '' }
  },
  
  // Relacionamentos - 🔧 CORRIGIDO: Array sempre inicializado
  followers: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    default: [] // ✅ Sempre um array vazio por padrão
  },
  following: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    default: [] // ✅ Sempre um array vazio por padrão
  },
  
  // Configurações
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Campos para reset de senha
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  lastPasswordReset: {
    type: Date,
    default: null
  },
  
  // Campos para verificação de email
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerifiedAt: {
    type: Date,
    default: null
  },
  
  // Estatísticas
  totalPosts: {
    type: Number,
    default: 0
  },
  totalEvents: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para performance
userSchema.index({ email: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ artistName: 1 });
userSchema.index({ genres: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ emailVerificationToken: 1 });

// 🔧 CAMPOS VIRTUAIS CORRIGIDOS - com verificação de undefined
userSchema.virtual('followersCount').get(function() {
  // ✅ Verificar se followers existe e é array antes de acessar .length
  return (this.followers && Array.isArray(this.followers)) ? this.followers.length : 0;
});

userSchema.virtual('followingCount').get(function() {
  // ✅ Verificar se following existe e é array antes de acessar .length
  return (this.following && Array.isArray(this.following)) ? this.following.length : 0;
});

// Middleware para hash da senha antes de salvar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    if (!this.isNew) {
      this.lastPasswordReset = new Date();
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// 🔧 MIDDLEWARE PRE-SAVE: Garantir arrays inicializados
userSchema.pre('save', function(next) {
  // ✅ Garantir que followers e following são sempre arrays
  if (!this.followers) this.followers = [];
  if (!this.following) this.following = [];
  
  // ✅ Garantir que são arrays válidos
  if (!Array.isArray(this.followers)) this.followers = [];
  if (!Array.isArray(this.following)) this.following = [];
  
  next();
});

// Método para comparar senhas
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Erro ao comparar senhas');
  }
};

// Método para gerar token de reset de senha
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hora
  
  return resetToken;
};

// Método para verificar se token de reset é válido
userSchema.methods.isResetTokenValid = function(token) {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  return (
    this.resetPasswordToken === hashedToken &&
    this.resetPasswordExpires > Date.now()
  );
};

// Método para limpar dados de reset
userSchema.methods.clearPasswordReset = function() {
  this.resetPasswordToken = null;
  this.resetPasswordExpires = null;
};

// Método para gerar token de verificação de email
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  return verificationToken;
};

// Método para verificar email
userSchema.methods.verifyEmail = function(token) {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  if (this.emailVerificationToken === hashedToken) {
    this.emailVerified = true;
    this.emailVerifiedAt = new Date();
    this.emailVerificationToken = null;
    return true;
  }
  
  return false;
};

// 🔧 MÉTODO SEGUIR USUÁRIO - com verificação de arrays
userSchema.methods.follow = async function(userId) {
  // ✅ Garantir que following é array
  if (!this.following) this.following = [];
  if (!Array.isArray(this.following)) this.following = [];
  
  if (!this.following.includes(userId)) {
    this.following.push(userId);
    await this.save();
    
    // Adicionar aos seguidores do usuário seguido
    await this.model('User').findByIdAndUpdate(userId, {
      $addToSet: { followers: this._id }
    });
  }
};

// 🔧 MÉTODO DEIXAR DE SEGUIR - com verificação de arrays
userSchema.methods.unfollow = async function(userId) {
  // ✅ Garantir que following é array
  if (!this.following) this.following = [];
  if (!Array.isArray(this.following)) this.following = [];
  
  this.following.pull(userId);
  await this.save();
  
  // Remover dos seguidores do usuário
  await this.model('User').findByIdAndUpdate(userId, {
    $pull: { followers: this._id }
  });
};

// 🔧 MÉTODO VERIFICAR SE SEGUE - com verificação de arrays
userSchema.methods.isFollowing = function(userId) {
  // ✅ Verificar se following existe e é array
  if (!this.following || !Array.isArray(this.following)) {
    return false;
  }
  return this.following.includes(userId);
};

// Método para transformar em objeto público (sem dados sensíveis)
userSchema.methods.toPublicJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpires;
  delete userObject.emailVerificationToken;
  delete userObject.__v;
  return userObject;
};

userSchema.methods.toPublicJSON = function() {
  const userObject = this.toObject();
  
  // Remover campos sensíveis
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpires;
  delete userObject.emailVerificationToken;
  delete userObject.__v;
  
  // ✅ GARANTIR QUE AVATAR PERMANECE NO OBJETO
  // (NÃO deletar userObject.avatar)
  
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
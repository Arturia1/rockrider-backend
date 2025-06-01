const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    enum: ['logout', 'password_change', 'account_suspended', 'manual_revoke', 'security_breach'],
    default: 'logout'
  },
  ip: {
    type: String,
    required: false
  },
  userAgent: {
    type: String,
    required: false
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// TTL index - remove automaticamente tokens expirados
tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Índice composto para consultas eficientes
tokenBlacklistSchema.index({ userId: 1, createdAt: -1 });
tokenBlacklistSchema.index({ reason: 1, createdAt: -1 });

// Middleware para log quando token é adicionado à blacklist
tokenBlacklistSchema.post('save', function() {
  console.log(`🚫 Token adicionado à blacklist: ${this.reason} - User: ${this.userId} - ${new Date().toISOString()}`);
});

// Método estático para invalidar todos os tokens de um usuário
tokenBlacklistSchema.statics.invalidateAllUserTokens = async function(userId, reason = 'manual_revoke') {
  try {
    const User = require('./User');
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('Usuário não encontrado');
    }
    
    // Em uma implementação real, seria necessário buscar todos os tokens ativos do usuário
    // Por enquanto, vamos apenas marcar um timestamp para invalidar tokens antigos
    user.lastPasswordReset = new Date();
    await user.save();
    
    console.log(`🚫 Todos os tokens invalidados para usuário: ${userId} - Razão: ${reason}`);
    
    return { message: 'Tokens invalidados com sucesso' };
  } catch (error) {
    console.error('Erro ao invalidar tokens:', error);
    throw error;
  }
};

// Método estático para verificar se token está na blacklist
tokenBlacklistSchema.statics.isTokenBlacklisted = async function(token) {
  try {
    const blacklistedToken = await this.findOne({ 
      token: token,
      expiresAt: { $gt: new Date() } 
    });
    
    return !!blacklistedToken;
  } catch (error) {
    console.error('Erro ao verificar blacklist:', error);
    return false; // Em caso de erro, permitir por segurança
  }
};

// Método estático para adicionar token à blacklist
tokenBlacklistSchema.statics.addTokenToBlacklist = async function(tokenData) {
  try {
    const { token, userId, reason, ip, userAgent, expiresAt } = tokenData;
    
    const blacklistEntry = new this({
      token,
      userId,
      reason,
      ip,
      userAgent,
      expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias padrão
    });
    
    await blacklistEntry.save();
    return blacklistEntry;
  } catch (error) {
    if (error.code === 11000) {
      // Token já está na blacklist
      console.log(`⚠️ Token já estava na blacklist: ${token.substring(0, 20)}...`);
      return null;
    }
    throw error;
  }
};

// Método estático para limpar tokens expirados manualmente (backup do TTL)
tokenBlacklistSchema.statics.cleanExpiredTokens = async function() {
  try {
    const result = await this.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    
    console.log(`🧹 Limpeza de tokens expirados: ${result.deletedCount} tokens removidos`);
    return result;
  } catch (error) {
    console.error('Erro na limpeza de tokens:', error);
    throw error;
  }
};

// Método estático para obter estatísticas
tokenBlacklistSchema.statics.getStats = async function() {
  try {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$reason',
          count: { $sum: 1 },
          lastAdded: { $max: '$createdAt' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    const total = await this.countDocuments();
    const active = await this.countDocuments({
      expiresAt: { $gt: new Date() }
    });
    
    return {
      total,
      active,
      expired: total - active,
      byReason: stats
    };
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    return null;
  }
};

// Virtual para verificar se token ainda está ativo
tokenBlacklistSchema.virtual('isActive').get(function() {
  return this.expiresAt > new Date();
});

// Método de instância para revogar (marcar como expirado)
tokenBlacklistSchema.methods.revoke = function() {
  this.expiresAt = new Date();
  return this.save();
};

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
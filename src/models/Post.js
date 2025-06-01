const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: [true, 'Comentário não pode estar vazio'],
    trim: true,
    maxlength: [500, 'Comentário deve ter no máximo 500 caracteres']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Conteúdo do post é obrigatório'],
    trim: true,
    maxlength: [2000, 'Post deve ter no máximo 2000 caracteres']
  },
  images: [{
    type: String, // URLs das imagens
    validate: {
      validator: function(v) {
        return v.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i);
      },
      message: 'URL de imagem inválida'
    }
  }],
  type: {
    type: String,
    enum: ['text', 'event', 'media'],
    default: 'text'
  },
  eventRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [commentSchema],
  
  // Hashtags extraídas do conteúdo
  hashtags: [{
    type: String,
    lowercase: true
  }],
  
  // Configurações do post
  isActive: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ type: 1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ isActive: 1 });
postSchema.index({ 'likes': 1 }); // Para queries de curtidas

// Campos virtuais
postSchema.virtual('likesCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

postSchema.virtual('commentsCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Middleware para extrair hashtags antes de salvar
postSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    // Extrair hashtags do conteúdo
    const hashtagRegex = /#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g;
    const hashtags = this.content.match(hashtagRegex);
    
    if (hashtags) {
      this.hashtags = hashtags.map(tag => tag.toLowerCase().replace('#', ''));
    } else {
      this.hashtags = [];
    }
  }
  next();
});

// Método para curtir post
postSchema.methods.like = function(userId) {
  // Garantir que likes seja uma array
  if (!this.likes) {
    this.likes = [];
  }
  
  // Converter userId para ObjectId se necessário
  const userIdObj = mongoose.Types.ObjectId.isValid(userId) 
    ? new mongoose.Types.ObjectId(userId) 
    : userId;
  
  if (!this.likes.some(id => id.equals(userIdObj))) {
    this.likes.push(userIdObj);
  }
  return this.save();
};

// Método para descurtir post
postSchema.methods.unlike = function(userId) {
  // Garantir que likes seja uma array
  if (!this.likes) {
    this.likes = [];
    return this.save();
  }
  
  // Converter userId para ObjectId se necessário
  const userIdObj = mongoose.Types.ObjectId.isValid(userId) 
    ? new mongoose.Types.ObjectId(userId) 
    : userId;
  
  this.likes = this.likes.filter(id => !id.equals(userIdObj));
  return this.save();
};

// Método para verificar se usuário curtiu
postSchema.methods.isLikedBy = function(userId) {
  if (!this.likes || !userId) {
    return false;
  }
  
  // Converter userId para ObjectId se necessário
  const userIdObj = mongoose.Types.ObjectId.isValid(userId) 
    ? new mongoose.Types.ObjectId(userId) 
    : userId;
  
  return this.likes.some(id => id.equals(userIdObj));
};

// Método para adicionar comentário
postSchema.methods.addComment = function(userId, text) {
  // Garantir que comments seja uma array
  if (!this.comments) {
    this.comments = [];
  }
  
  this.comments.push({
    user: userId,
    text: text
  });
  return this.save();
};

// Método para remover comentário
postSchema.methods.removeComment = function(commentId) {
  if (!this.comments) {
    return this.save();
  }
  
  this.comments = this.comments.filter(comment => 
    !comment._id.equals(commentId)
  );
  return this.save();
};

// Static method aprimorado para buscar posts do feed
postSchema.statics.getFeedPosts = function(userId, followingIds = [], page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  // Garantir que followingIds seja uma array válida
  const validFollowingIds = Array.isArray(followingIds) ? followingIds : [];
  
  const filter = {
    isActive: true
  };
  
  // Se há usuários seguidos, incluir posts deles
  if (validFollowingIds.length > 0) {
    filter.$or = [
      { author: userId }, // Posts próprios
      { author: { $in: validFollowingIds } } // Posts de quem segue
    ];
  } else {
    // Apenas posts próprios se não segue ninguém
    filter.author = userId;
  }
  
  return this.find(filter)
    .populate('author', 'name artistName avatar userType isVerified')
    .populate('eventRef', 'title date location')
    .populate('comments.user', 'name artistName avatar')
    .sort({ isPinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(false); // Garantir que retorna documentos Mongoose
};

// Método estático para buscar posts populares
postSchema.statics.getPopularPosts = function(excludeUserId = null, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  const filter = {
    isActive: true,
    $expr: {
      $gte: [
        { $add: [{ $size: '$likes' }, { $size: '$comments' }] },
        2 // Posts com pelo menos 2 interações
      ]
    }
  };
  
  // Excluir posts de um usuário específico se fornecido
  if (excludeUserId) {
    filter.author = { $ne: excludeUserId };
  }
  
  return this.find(filter)
    .populate('author', 'name artistName avatar userType isVerified')
    .populate('eventRef', 'title date location')
    .populate('comments.user', 'name artistName avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(false); // Garantir que retorna documentos Mongoose
};

// Método estático para buscar por hashtag
postSchema.statics.findByHashtag = function(hashtag, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  return this.find({
    hashtags: { $in: [hashtag.toLowerCase().replace('#', '')] },
    isActive: true
  })
  .populate('author', 'name artistName avatar userType isVerified')
  .populate('eventRef', 'title date location')
  .populate('comments.user', 'name artistName avatar')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .lean(false);
};

module.exports = mongoose.model('Post', postSchema);
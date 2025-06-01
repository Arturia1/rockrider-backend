const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Título do evento é obrigatório'],
    trim: true,
    maxlength: [200, 'Título deve ter no máximo 200 caracteres']
  },
  description: {
    type: String,
    required: [true, 'Descrição do evento é obrigatória'],
    trim: true,
    maxlength: [2000, 'Descrição deve ter no máximo 2000 caracteres']
  },
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: [true, 'Data do evento é obrigatória'],
    validate: {
      validator: function(v) {
        return v > new Date();
      },
      message: 'Data do evento deve ser no futuro'
    }
  },
  location: {
    venue: {
      type: String,
      required: [true, 'Local do evento é obrigatório'],
      trim: true,
      maxlength: [200, 'Nome do local deve ter no máximo 200 caracteres']
    },
    address: {
      type: String,
      required: [true, 'Endereço é obrigatório'],
      trim: true,
      maxlength: [300, 'Endereço deve ter no máximo 300 caracteres']
    },
    city: {
      type: String,
      required: [true, 'Cidade é obrigatória'],
      trim: true,
      maxlength: [100, 'Cidade deve ter no máximo 100 caracteres']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [50, 'Estado deve ter no máximo 50 caracteres']
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  ticketPrice: {
    min: {
      type: Number,
      min: [0, 'Preço mínimo não pode ser negativo'],
      default: 0
    },
    max: {
      type: Number,
      min: [0, 'Preço máximo não pode ser negativo']
    }
  },
  ticketLink: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || v.match(/^https?:\/\/.+/);
      },
      message: 'Link de ingresso deve ser uma URL válida'
    }
  },
  image: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || v.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i);
      },
      message: 'URL de imagem inválida'
    }
  },
  
  // Participantes
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['going', 'interested', 'not_going'],
      default: 'interested'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Categorização
  genre: {
    type: String,
    enum: [
      'Rock', 'Pop', 'Hip Hop', 'Electronic', 'Jazz', 'Blues', 
      'Country', 'Reggae', 'Folk', 'Classical', 'Funk', 
      'Soul', 'R&B', 'Indie', 'Alternative', 'Metal'
    ]
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  
  // Status do evento
  status: {
    type: String,
    enum: ['scheduled', 'cancelled', 'postponed', 'completed'],
    default: 'scheduled'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  // Capacidade
  capacity: {
    type: Number,
    min: [1, 'Capacidade deve ser pelo menos 1']
  },
  
  // Configurações
  allowComments: {
    type: Boolean,
    default: true
  },
  isPublic: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
eventSchema.index({ artist: 1, date: 1 });
eventSchema.index({ date: 1 });
eventSchema.index({ genre: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ 'location.city': 1 });
eventSchema.index({ 'location.coordinates': '2dsphere' });

// Campos virtuais
eventSchema.virtual('attendeesCount').get(function() {
  return this.attendees.length;
});

eventSchema.virtual('goingCount').get(function() {
  return this.attendees.filter(a => a.status === 'going').length;
});

eventSchema.virtual('interestedCount').get(function() {
  return this.attendees.filter(a => a.status === 'interested').length;
});

eventSchema.virtual('isUpcoming').get(function() {
  return this.date > new Date();
});

eventSchema.virtual('isPast').get(function() {
  return this.date < new Date();
});

// Método para adicionar participante
eventSchema.methods.addAttendee = function(userId, status = 'interested') {
  // Remover participação anterior se existir
  this.attendees = this.attendees.filter(a => !a.user.equals(userId));
  
  // Adicionar nova participação
  this.attendees.push({
    user: userId,
    status: status
  });
  
  return this.save();
};

// Método para remover participante
eventSchema.methods.removeAttendee = function(userId) {
  this.attendees = this.attendees.filter(a => !a.user.equals(userId));
  return this.save();
};

// Método para verificar se usuário participa
eventSchema.methods.getUserAttendance = function(userId) {
  const attendance = this.attendees.find(a => a.user.equals(userId));
  return attendance ? attendance.status : null;
};

// Método para buscar eventos próximos geograficamente
eventSchema.statics.findNearby = function(longitude, latitude, maxDistance = 50000) {
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    },
    date: { $gte: new Date() },
    status: 'scheduled',
    isActive: true,
    isPublic: true
  })
  .populate('artist', 'name artistName avatar isVerified')
  .sort({ date: 1 });
};

// Método para buscar eventos por cidade
eventSchema.statics.findByCity = function(city, limit = 20) {
  return this.find({
    'location.city': new RegExp(city, 'i'),
    date: { $gte: new Date() },
    status: 'scheduled',
    isActive: true,
    isPublic: true
  })
  .populate('artist', 'name artistName avatar isVerified')
  .sort({ date: 1 })
  .limit(limit);
};

// Middleware para atualizar contadores no usuário
eventSchema.post('save', async function() {
  if (this.isNew) {
    await this.model('User').findByIdAndUpdate(
      this.artist,
      { $inc: { totalEvents: 1 } }
    );
  }
});

module.exports = mongoose.model('Event', eventSchema);
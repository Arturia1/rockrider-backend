const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const Event = require('../models/Event');
const User = require('../models/User');
const { auth, requireArtist, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/events
// @desc    Listar eventos públicos
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      city, 
      genre, 
      status = 'scheduled',
      featured,
      upcoming = true
      participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    } = req.query;
    
    const skip = (page - 1) * limit;

    // Construir filtro
    const filter = {
      isActive: true,
      isPublic: true,
      status: status
    };

    // Filtrar apenas eventos futuros por padrão
    if (upcoming === 'true') {
      filter.date = { $gte: new Date() };
    }

    // Filtrar por cidade
    if (city) {
      filter['location.city'] = new RegExp(city, 'i');
    }

    // Filtrar por gênero
    if (genre) {
      filter.genre = genre;
    }

    // Filtrar eventos em destaque
    if (featured === 'true') {
      filter.isFeatured = true;
    }

    const events = await Event.find(filter)
      .populate('artist', 'name artistName avatar userType isVerified')
      .sort({ isFeatured: -1, date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Adicionar informação de participação do usuário
    const eventsWithUserData = events.map(event => {
      const eventObj = event.toObject();
      if (req.user) {
        eventObj.userAttendance = event.getUserAttendance(req.user.userId);
      }
      return eventObj;
    });

    res.json({
      events: eventsWithUserData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasNext: events.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erro ao listar eventos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/events/nearby
// @desc    Buscar eventos próximos por localização
// @access  Public
router.get('/nearby', [
  query('lat').isFloat().withMessage('Latitude inválida'),
  query('lng').isFloat().withMessage('Longitude inválida'),
  query('maxDistance').optional().isInt({ min: 1000, max: 100000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { lat, lng, maxDistance = 50000 } = req.query;

    const events = await Event.findNearby(
      parseFloat(lng), 
      parseFloat(lat), 
      parseInt(maxDistance)
    );

    res.json({ events });

  } catch (error) {
    console.error('Erro ao buscar eventos próximos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/events/search
// @desc    Buscar eventos
// @access  Public
router.get('/search', [
  query('q').trim().isLength({ min: 1 }).withMessage('Termo de busca é obrigatório')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { q, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const events = await Event.find({
      $and: [
        {
          $or: [
            { title: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { 'location.venue': { $regex: q, $options: 'i' } },
            { 'location.city': { $regex: q, $options: 'i' } },
            { tags: { $in: [new RegExp(q, 'i')] } }
          ]
        },
        {
          isActive: true,
          isPublic: true,
          status: 'scheduled',
          date: { $gte: new Date() }
        }
      ]
    })
    .populate('artist', 'name artistName avatar userType isVerified')
    .sort({ date: 1 })
    .skip(skip)
    .limit(parseInt(limit));

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasNext: events.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erro ao buscar eventos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/events/stats/popular
// @desc    Obter eventos mais populares
// @access  Public
router.get('/stats/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const popularEvents = await Event.find({
      isActive: true,
      isPublic: true,
      status: 'scheduled',
      date: { $gte: new Date() }
    })
    .populate('artist', 'name artistName avatar isVerified')
    .sort({ 
      attendeesCount: -1, // Ordenar por número de participantes
      isFeatured: -1,
      date: 1 
    })
    .limit(parseInt(limit));

    res.json({ events: popularEvents });

  } catch (error) {
    console.error('Erro ao buscar eventos populares:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   POST /api/events
// @desc    Criar novo evento
// @access  Private (apenas artistas)
router.post('/', auth, requireArtist, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Título deve ter entre 1 e 200 caracteres'),
  
  body('description')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Descrição deve ter entre 1 e 2000 caracteres'),
  
  body('date')
    .isISO8601()
    .withMessage('Data inválida'),
  
  body('location.venue')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Local deve ter entre 1 e 200 caracteres'),
  
  body('location.address')
    .trim()
    .isLength({ min: 1, max: 300 })
    .withMessage('Endereço deve ter entre 1 e 300 caracteres'),
  
  body('location.city')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Cidade deve ter entre 1 e 100 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    // Verificar se a data é no futuro
    const eventDate = new Date(req.body.date);
    if (eventDate <= new Date()) {
      return res.status(400).json({
        error: 'Data do evento deve ser no futuro'
      });
    }

    const eventData = {
      ...req.body,
      artist: req.user.userId,
      date: eventDate
    };

    const event = new Event(eventData);
    await event.save();

    // Popular dados do artista
    await event.populate('artist', 'name artistName avatar isVerified');

    res.status(201).json({
      message: 'Evento criado com sucesso',
      event: event.toObject()
    });

  } catch (error) {
    console.error('Erro ao criar evento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/events/:id
// @desc    Obter evento específico
// @access  Public

// Eventos que o usuário está participando
router.get('/attending', auth, async (req, res) => {
  try {
    const events = await Event.find({
      'attendees.user': req.user.userId
    }).populate('artist', 'name artistName avatar isVerified');

    res.json({ events });
  } catch (error) {
    console.error('Erro ao buscar eventos que está participando:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Eventos criados pelo usuário autenticado
router.get('/my-events', auth, async (req, res) => {
  try {
    const events = await Event.find({ artist: req.user.userId })
      .sort({ date: -1 })
      .populate('artist', 'name artistName avatar isVerified');

    res.json({ events });
  } catch (error) {
    console.error('Erro ao buscar eventos do artista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/:id', optionalAuth, [
  param('id').isMongoId().withMessage('ID do evento inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do evento inválido' });
    }

    const event = await Event.findById(req.params.id)
      .populate('artist', 'name artistName avatar userType isVerified')
      .populate('attendees.user', 'name artistName avatar');

    if (!event || !event.isActive) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    const eventObj = event.toObject();
    if (req.user) {
      eventObj.userAttendance = event.getUserAttendance(req.user.userId);
      eventObj.canEdit = event.artist._id.equals(req.user.userId);
    }

    res.json({ event: eventObj });

  } catch (error) {
    console.error('Erro ao buscar evento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   PUT /api/events/:id
// @desc    Atualizar evento
// @access  Private (apenas criador do evento)
router.put('/:id', auth, [
  param('id').isMongoId().withMessage('ID do evento inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do evento inválido' });
    }

    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    // Verificar se é o criador do evento
    if (!event.artist.equals(req.user.userId)) {
      return res.status(403).json({
        error: 'Você só pode editar seus próprios eventos'
      });
    }

    // Campos permitidos para atualização
    const allowedUpdates = [
      'title', 'description', 'date', 'location', 'ticketPrice', 
      'ticketLink', 'image', 'genre', 'tags', 'capacity', 'status'
    ];

    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // Validar data se estiver sendo atualizada
    if (updates.date) {
      const eventDate = new Date(updates.date);
      if (eventDate <= new Date()) {
        return res.status(400).json({
          error: 'Data do evento deve ser no futuro'
        });
      }
      updates.date = eventDate;
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('artist', 'name artistName avatar isVerified');

    res.json({
      message: 'Evento atualizado com sucesso',
      event: updatedEvent.toObject()
    });

  } catch (error) {
    console.error('Erro ao atualizar evento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   DELETE /api/events/:id
// @desc    Deletar evento
// @access  Private (apenas criador do evento)
router.delete('/:id', auth, [
  param('id').isMongoId().withMessage('ID do evento inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do evento inválido' });
    }

    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    // Verificar se é o criador do evento
    if (!event.artist.equals(req.user.userId)) {
      return res.status(403).json({
        error: 'Você só pode deletar seus próprios eventos'
      });
    }

    await Event.findByIdAndDelete(req.params.id);

    // Decrementar contador de eventos do usuário
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { totalEvents: -1 }
    });

    res.json({ message: 'Evento deletado com sucesso' });

  } catch (error) {
    console.error('Erro ao deletar evento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   POST /api/events/:id/attend
// @desc    Marcar presença em evento
// @access  Private
router.post('/:id/attend', auth, [
  param('id').isMongoId().withMessage('ID do evento inválido'),
  body('status')
    .isIn(['going', 'interested', 'not_going'])
    .withMessage('Status deve ser: going, interested ou not_going')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const event = await Event.findById(req.params.id);
    
    if (!event || !event.isActive) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    const { status } = req.body;
    
    if (status === 'not_going') {
      await event.removeAttendee(req.user.userId);
    } else {
      await event.addAttendee(req.user.userId, status);
    }

    const statusMessages = {
      going: 'Você confirmou presença no evento',
      interested: 'Você marcou interesse no evento',
      not_going: 'Você removeu sua participação do evento'
    };

    res.json({
      message: statusMessages[status],
      userAttendance: status === 'not_going' ? null : status,
      attendeesCount: event.attendeesCount,
      goingCount: event.goingCount,
      interestedCount: event.interestedCount
    });

  } catch (error) {
    console.error('Erro ao marcar presença:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/events/:id/attendees
// @desc    Listar participantes do evento
// @access  Public
router.get('/:id/attendees', [
  param('id').isMongoId().withMessage('ID do evento inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do evento inválido' });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const event = await Event.findById(req.params.id)
      .populate('attendees.user', 'name artistName avatar userType isVerified');

    if (!event || !event.isActive) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    let attendees = event.attendees;

    // Filtrar por status se especificado
    if (status && ['going', 'interested'].includes(status)) {
      attendees = attendees.filter(a => a.status === status);
    }

    // Paginação manual
    const paginatedAttendees = attendees
      .slice(skip, skip + parseInt(limit))
      .map(attendee => ({
        user: attendee.user,
        status: attendee.status,
        registeredAt: attendee.registeredAt
      }));

    res.json({
      attendees: paginatedAttendees,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: attendees.length,
        hasNext: skip + paginatedAttendees.length < attendees.length
      }
    });

  } catch (error) {
    console.error('Erro ao listar participantes:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/events/artist/:artistId
// @desc    Listar eventos de um artista
// @access  Public
router.get('/artist/:artistId', optionalAuth, [
  param('artistId').isMongoId().withMessage('ID do artista inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do artista inválido' });
    }

    const { page = 1, limit = 20, upcoming = true } = req.query;
    const skip = (page - 1) * limit;

    // Verificar se artista existe
    const artist = await User.findById(req.params.artistId);
    if (!artist || artist.userType !== 'artist' || !artist.isActive) {
      return res.status(404).json({ error: 'Artista não encontrado' });
    }

    const filter = {
      artist: req.params.artistId,
      isActive: true,
      isPublic: true
    };

    // Filtrar apenas eventos futuros se solicitado
    if (upcoming === 'true') {
      filter.date = { $gte: new Date() };
      filter.status = 'scheduled';
    }

    const events = await Event.find(filter)
      .populate('artist', 'name artistName avatar isVerified')
      .sort({ date: upcoming === 'true' ? 1 : -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Adicionar informação de participação do usuário
    const eventsWithUserData = events.map(event => {
      const eventObj = event.toObject();
      if (req.user) {
        eventObj.userAttendance = event.getUserAttendance(req.user.userId);
      }
      return eventObj;
    });

    res.json({
      events: eventsWithUserData,
      artist: artist.toPublicJSON(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasNext: events.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erro ao listar eventos do artista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});



module.exports = router;
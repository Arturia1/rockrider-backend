const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Post = require('../models/Post');
const User = require('../models/User');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/posts/feed/following
// @desc    Feed "Following" - posts próprios e de quem você segue
// @access  Private
router.get('/feed/following', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    console.log(`👥 Feed Following requisitado por: ${user.name} (${user.userType})`);

    // Garantir que following é uma array válida
    const followingIds = user.following && user.following.length > 0 ? user.following : [];
    
    let posts;
    
    if (followingIds.length === 0) {
      console.log('📝 Usuário não segue ninguém, mostrando apenas posts próprios');
      // Se não segue ninguém, mostrar apenas posts próprios
      posts = await Post.find({
        author: user._id,
        isActive: true
      })
      .populate('author', 'name artistName avatar userType isVerified')
      .populate('eventRef', 'title date location')
      .populate('comments.user', 'name artistName avatar')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    } else {
      console.log(`👥 Usuário segue ${followingIds.length} pessoas`);
      // Posts próprios + posts de quem segue
      posts = await Post.find({
        $or: [
          { author: user._id }, // Posts próprios
          { author: { $in: followingIds } } // Posts de quem segue
        ],
        isActive: true
      })
      .populate('author', 'name artistName avatar userType isVerified')
      .populate('eventRef', 'title date location')
      .populate('comments.user', 'name artistName avatar')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    }

    // Verificar se posts é uma array válida e processar apenas documentos Mongoose
    if (!Array.isArray(posts)) {
      posts = [];
    }

    // Adicionar informação se o usuário curtiu cada post
    const postsWithUserData = posts.map(post => {
      if (!post || typeof post.toObject !== 'function') {
        console.error('Post inválido encontrado:', post);
        return null;
      }

      try {
        const postObj = post.toObject();
        postObj.isLikedByUser = post.isLikedBy(user._id);
        return postObj;
      } catch (error) {
        console.error('Erro ao processar post:', error);
        return null;
      }
    }).filter(post => post !== null);

    console.log(`✅ Feed Following carregado: ${postsWithUserData.length} posts`);

    res.json({
      posts: postsWithUserData,
      pagination: {
        page,
        limit,
        hasNext: posts.length === limit
      },
      meta: {
        totalPosts: postsWithUserData.length,
        followingCount: followingIds.length,
        feedType: 'following'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar feed following:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível carregar o feed'
    });
  }
});

// @route   GET /api/posts/feed/for-you
// @desc    Feed "For You" - algoritmo de descoberta MELHORADO
// @access  Private
router.get('/feed/for-you', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    console.log(`✨ Feed For You requisitado por: ${user.name} (${user.userType})`);

    // IDs para excluir (posts próprios e de quem já segue)
    const excludeIds = [user._id, ...(user.following || [])];

    // 🤖 ALGORITMO "FOR YOU" MELHORADO
    let algorithmPosts = [];

    console.log('🤖 Executando algoritmo For You melhorado...');

    // 1. Posts populares recentes (últimos 14 dias) - 40% do feed
    const recentPopular = await Post.find({
      author: { $nin: excludeIds },
      isActive: true,
      createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      // ✅ CORRIGIDO: Apenas 1+ interação (era 3 antes)
      $expr: {
        $gte: [
          { $add: [{ $size: '$likes' }, { $size: '$comments' }] },
          1
        ]
      }
    })
    .populate('author', 'name artistName avatar userType isVerified genres')
    .populate('eventRef', 'title date location')
    .populate('comments.user', 'name artistName avatar')
    .sort({ createdAt: -1 })
    .limit(Math.floor(limit * 0.4));

    algorithmPosts.push(...recentPopular);
    console.log(`📈 Posts populares: ${recentPopular.length}`);

    // 2. Posts de artistas verificados (últimos 21 dias) - 30% do feed
    if (algorithmPosts.length < limit) {
      const verifiedArtistsPosts = await Post.find({
        author: { 
          $nin: excludeIds,
          $in: await User.find({
            userType: 'artist',
            isVerified: true,
            _id: { $nin: excludeIds }
          }).distinct('_id')
        },
        isActive: true,
        createdAt: { $gte: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) }
      })
      .populate('author', 'name artistName avatar userType isVerified genres')
      .populate('eventRef', 'title date location')
      .populate('comments.user', 'name artistName avatar')
      .sort({ createdAt: -1 })
      .limit(Math.floor(limit * 0.3));

      algorithmPosts.push(...verifiedArtistsPosts);
      console.log(`✅ Posts de verificados: ${verifiedArtistsPosts.length}`);
    }

    // 3. Posts recentes diversos (últimos 7 dias) - 30% do feed
    if (algorithmPosts.length < limit) {
      const recentDiverse = await Post.find({
        author: { $nin: excludeIds },
        isActive: true,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
      .populate('author', 'name artistName avatar userType isVerified')
      .populate('eventRef', 'title date location')
      .populate('comments.user', 'name artistName avatar')
      .sort({ createdAt: -1 })
      .limit(limit - algorithmPosts.length);

      algorithmPosts.push(...recentDiverse);
      console.log(`📝 Posts diversos: ${recentDiverse.length}`);
    }

    // Remover duplicatas
    const uniquePosts = algorithmPosts.filter((post, index, self) => 
      index === self.findIndex(p => p._id.toString() === post._id.toString())
    );

    // Embaralhar um pouco para não ficar sempre na mesma ordem
    const shuffledPosts = uniquePosts
      .sort(() => Math.random() - 0.5)
      .slice((page - 1) * limit, page * limit);

    // Adicionar informação se o usuário curtiu cada post
    const postsWithUserData = shuffledPosts.map(post => {
      if (!post || typeof post.toObject !== 'function') {
        console.error('Post inválido encontrado:', post);
        return null;
      }

      try {
        const postObj = post.toObject();
        postObj.isLikedByUser = post.isLikedBy(user._id);
        return postObj;
      } catch (error) {
        console.error('Erro ao processar post for you:', error);
        return null;
      }
    }).filter(post => post !== null);

    console.log(`✅ Feed For You carregado: ${postsWithUserData.length} posts`);

    res.json({
      posts: postsWithUserData,
      pagination: {
        page,
        limit,
        hasNext: shuffledPosts.length === limit
      },
      meta: {
        totalPosts: postsWithUserData.length,
        algorithm: {
          popularPosts: recentPopular.length,
          verifiedPosts: algorithmPosts.filter(p => p.author?.isVerified).length,
          totalCandidates: uniquePosts.length
        },
        feedType: 'for-you',
        improved: true
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar feed for you:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível carregar o feed personalizado'
    });
  }
});

// @route   GET /api/posts/feed (backward compatibility)
// @desc    Feed padrão - redireciona para following
// @access  Private
router.get('/feed', auth, async (req, res) => {
  console.log('📱 Feed padrão solicitado, redirecionando para following');
  // Chamar internamente o feed following
  req.url = '/feed/following';
  return router.handle(req, res);
});

// @route   GET /api/posts/discover
// @desc    Descobrir posts populares (CORRIGIDO - MENOS RESTRITIVO)
// @access  Public
router.get('/discover', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log(`🔍 Discover posts solicitado - Página: ${page}`);

    // ✅ FILTRO CORRIGIDO: MUITO MENOS RESTRITIVO
    const posts = await Post.find({
      isActive: true,
      // Posts com 1+ interação OU posts dos últimos 7 dias
      $or: [
        {
          // Posts com pelo menos 1 curtida ou comentário
          $expr: {
            $gte: [
              { $add: [{ $size: '$likes' }, { $size: '$comments' }] },
              1 // ✅ Era 5, agora é 1
            ]
          }
        },
        {
          // Posts recentes (últimos 7 dias) mesmo sem interações
          createdAt: { 
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
          }
        }
      ]
    })
    .populate('author', 'name artistName avatar userType isVerified')
    .populate('eventRef', 'title date location')
    .populate('comments.user', 'name artistName avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    // Adicionar informação se o usuário curtiu (se logado)
    const postsWithUserData = posts.map(post => {
      if (!post || typeof post.toObject !== 'function') {
        return null;
      }

      try {
        const postObj = post.toObject();
        if (req.user) {
          postObj.isLikedByUser = post.isLikedBy(req.user.userId);
        }
        return postObj;
      } catch (error) {
        console.error('Erro ao processar post do discover:', error);
        return null;
      }
    }).filter(post => post !== null);

    console.log(`✅ Discover carregado: ${postsWithUserData.length} posts`);

    res.json({
      posts: postsWithUserData,
      pagination: {
        page,
        limit,
        hasNext: posts.length === limit
      },
      meta: {
        feedType: 'discover',
        algorithm: 'mixed_improved', // 1+ interação OU recente
        filterUsed: 'less_restrictive'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar posts discover:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   POST /api/posts
// @desc    Criar novo post
// @access  Private
router.post('/', auth, [
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Conteúdo deve ter entre 1 e 2000 caracteres'),
  
  body('type')
    .optional()
    .isIn(['text', 'event', 'media'])
    .withMessage('Tipo de post inválido'),
  
  body('images')
    .optional()
    .isArray({ max: 4 })
    .withMessage('Máximo 4 imagens por post'),
  
  body('eventRef')
    .optional()
    .isMongoId()
    .withMessage('ID do evento inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { content, type, images, eventRef } = req.body;

    console.log(`📝 Criando post para usuário: ${req.user.userId}`);

    const postData = {
      author: req.user.userId,
      content,
      type: type || 'text',
      images: images || []
    };

    if (eventRef) {
      postData.eventRef = eventRef;
      postData.type = 'event';
    }

    const post = new Post(postData);
    await post.save();

    // Atualizar contador de posts do usuário
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { totalPosts: 1 }
    });

    // Popular dados para retorno
    await post.populate('author', 'name artistName avatar userType isVerified');
    if (post.eventRef) {
      await post.populate('eventRef', 'title date location');
    }

    console.log(`✅ Post criado: ${post._id}`);

    res.status(201).json({
      message: 'Post criado com sucesso',
      post: post.toObject()
    });

  } catch (error) {
    console.error('❌ Erro ao criar post:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   POST /api/posts/:id/like
// @desc    Curtir/descurtir post
// @access  Private
router.post('/:id/like', auth, [
  param('id').isMongoId().withMessage('ID do post inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do post inválido' });
    }

    const post = await Post.findById(req.params.id);
    
    if (!post || !post.isActive) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }

    const isLiked = post.isLikedBy(req.user.userId);
    
    if (isLiked) {
      await post.unlike(req.user.userId);
    } else {
      await post.like(req.user.userId);
    }

    console.log(`❤️ Post ${!isLiked ? 'curtido' : 'descurtido'}: ${post._id}`);

    res.json({
      message: isLiked ? 'Post descurtido' : 'Post curtido',
      isLiked: !isLiked,
      likesCount: post.likesCount
    });

  } catch (error) {
    console.error('❌ Erro ao curtir post:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   POST /api/posts/:id/comment
// @desc    Comentar em post
// @access  Private
router.post('/:id/comment', auth, [
  param('id').isMongoId().withMessage('ID do post inválido'),
  body('text')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Comentário deve ter entre 1 e 500 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const post = await Post.findById(req.params.id);
    
    if (!post || !post.isActive) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }

    await post.addComment(req.user.userId, req.body.text);
    await post.populate('comments.user', 'name artistName avatar');

    const newComment = post.comments[post.comments.length - 1];

    console.log(`💬 Comentário adicionado ao post: ${post._id}`);

    res.status(201).json({
      message: 'Comentário adicionado com sucesso',
      comment: newComment,
      commentsCount: post.commentsCount
    });

  } catch (error) {
    console.error('❌ Erro ao comentar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/posts/:id
// @desc    Obter post específico
// @access  Public
router.get('/:id', optionalAuth, [
  param('id').isMongoId().withMessage('ID do post inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do post inválido' });
    }

    const post = await Post.findById(req.params.id)
      .populate('author', 'name artistName avatar userType isVerified')
      .populate('eventRef', 'title date location')
      .populate('comments.user', 'name artistName avatar');

    if (!post || !post.isActive) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }

    const postObj = post.toObject();
    if (req.user) {
      postObj.isLikedByUser = post.isLikedBy(req.user.userId);
      postObj.canEdit = post.author._id.equals(req.user.userId);
    }

    res.json({ post: postObj });

  } catch (error) {
    console.error('Erro ao buscar post:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   PUT /api/posts/:id
// @desc    Atualizar post
// @access  Private (apenas autor)
router.put('/:id', auth, [
  param('id').isMongoId().withMessage('ID do post inválido'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Conteúdo deve ter entre 1 e 2000 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const post = await Post.findById(req.params.id);
    
    if (!post || !post.isActive) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }

    // Verificar se é o autor do post
    if (!post.author.equals(req.user.userId)) {
      return res.status(403).json({
        error: 'Você só pode editar seus próprios posts'
      });
    }

    post.content = req.body.content;
    await post.save();

    await post.populate('author', 'name artistName avatar userType isVerified');

    console.log(`📝 Post atualizado: ${post._id}`);

    res.json({
      message: 'Post atualizado com sucesso',
      post: post.toObject()
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar post:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   DELETE /api/posts/:id
// @desc    Deletar post
// @access  Private (apenas autor)
router.delete('/:id', auth, [
  param('id').isMongoId().withMessage('ID do post inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do post inválido' });
    }

    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }

    // Verificar se é o autor do post
    if (!post.author.equals(req.user.userId)) {
      return res.status(403).json({
        error: 'Você só pode deletar seus próprios posts'
      });
    }

    await Post.findByIdAndDelete(req.params.id);

    // Decrementar contador de posts do usuário
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { totalPosts: -1 }
    });

    console.log(`🗑️ Post deletado: ${req.params.id}`);

    res.json({ message: 'Post deletado com sucesso' });

  } catch (error) {
    console.error('❌ Erro ao deletar post:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/posts/search
// @desc    Buscar posts por termo ou hashtag
// @access  Public
router.get('/search', [
  body('q').optional().trim().isLength({ min: 1 }).withMessage('Termo de busca muito curto'),
  body('hashtag').optional().trim().isLength({ min: 1 }).withMessage('Hashtag inválida')
], async (req, res) => {
  try {
    const { q, hashtag, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    if (!q && !hashtag) {
      return res.status(400).json({
        error: 'Parâmetro de busca obrigatório',
        message: 'Forneça "q" para busca geral ou "hashtag" para busca por hashtag'
      });
    }

    let searchQuery = { isActive: true };

    if (hashtag) {
      searchQuery.hashtags = { $in: [hashtag.toLowerCase().replace('#', '')] };
    } else if (q) {
      searchQuery.$or = [
        { content: { $regex: q, $options: 'i' } },
        { hashtags: { $in: [q.toLowerCase().replace('#', '')] } }
      ];
    }

    const posts = await Post.find(searchQuery)
      .populate('author', 'name artistName avatar userType isVerified')
      .populate('eventRef', 'title date location')
      .populate('comments.user', 'name artistName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log(`🔍 Busca realizada: "${q || hashtag}" - ${posts.length} resultados`);

    res.json({
      posts: posts.map(post => post.toObject()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasNext: posts.length === parseInt(limit)
      },
      searchTerm: q || hashtag,
      searchType: hashtag ? 'hashtag' : 'general'
    });

  } catch (error) {
    console.error('❌ Erro na busca:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
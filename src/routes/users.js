const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const User = require('../models/User');
const Post = require('../models/Post');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/search
// @desc    Buscar usuários
// @access  Public
router.get('/search', [
  query('q').trim().isLength({ min: 1 }).withMessage('Termo de busca é obrigatório')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
    }

    const { q, type, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const searchFilter = {
      isActive: true,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { artistName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    };

    if (type && ['artist', 'fan'].includes(type)) {
      searchFilter.userType = type;
    }

    const users = await User.find(searchFilter)
      .select('-password')
      .sort({ isVerified: -1, followersCount: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      users: users.map(user => user.toPublicJSON()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasNext: users.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/users/discover
// @desc    Descobrir novos artistas
// @access  Public
router.get('/discover', optionalAuth, async (req, res) => {
  try {
    const { genre, limit = 20 } = req.query;

    const filter = {
      userType: 'artist',
      isActive: true
    };

    if (genre) {
      filter.genres = { $in: [genre] };
    }

    if (req.user) {
      const user = await User.findById(req.user.userId);
      filter._id = { $nin: [...user.following, user._id] };
    }

    const artists = await User.find(filter)
      .select('-password')
      .sort({ isVerified: -1, followersCount: -1, totalPosts: -1 })
      .limit(parseInt(limit));

    res.json({
      artists: artists.map(artist => artist.toPublicJSON())
    });

  } catch (error) {
    console.error('Erro ao descobrir artistas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/users/:id
// @desc    Obter perfil de usuário
// @access  Public
router.get('/:id', optionalAuth, [
  param('id').isMongoId().withMessage('ID do usuário inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const user = await User.findById(req.params.id)
      .populate('followers', 'name artistName avatar userType')
      .populate('following', 'name artistName avatar userType');

    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const userProfile = user.toPublicJSON();

    // Garantir contadores no JSON
    userProfile.followersCount = user.followersCount ?? user.followers?.length ?? 0;
    userProfile.followingCount = user.followingCount ?? user.following?.length ?? 0;
    userProfile.totalPosts = user.totalPosts ?? 0;

    if (req.user) {
      const currentUser = await User.findById(req.user.userId);
      userProfile.isFollowing = currentUser.isFollowing(user._id);
      userProfile.isOwnProfile = req.user.userId === user._id.toString();
    }

    res.json({ user: userProfile });

  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/users/:id/posts
// @desc    Obter posts de um usuário
// @access  Public
router.get('/:id/posts', optionalAuth, [
  param('id').isMongoId().withMessage('ID do usuário inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.params.id);
    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const posts = await Post.find({ author: req.params.id, isActive: true })
      .populate('author', 'name artistName avatar userType isVerified')
      .populate('eventRef', 'title date location')
      .populate('comments.user', 'name artistName avatar')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const postsWithUserData = posts.map(post => {
      const postObj = post.toObject();
      if (req.user) {
        postObj.isLikedByUser = post.isLikedBy(req.user.userId);
      }
      return postObj;
    });

    res.json({
      posts: postsWithUserData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasNext: posts.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erro ao buscar posts do usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   POST /api/users/:id/follow
// @desc    Seguir/deixar de seguir usuário
// @access  Private
router.post('/:id/follow', auth, [
  param('id').isMongoId().withMessage('ID do usuário inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const targetUserId = req.params.id;
    const currentUserId = req.user.userId;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: 'Você não pode seguir a si mesmo' });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId)
    ]);

    if (!currentUser || !targetUser || !targetUser.isActive) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const isFollowing = currentUser.isFollowing(targetUserId);

    if (isFollowing) {
      await currentUser.unfollow(targetUserId);
      res.json({
        message: `Você deixou de seguir ${targetUser.artistName || targetUser.name}`,
        isFollowing: false,
        followersCount: targetUser.followersCount - 1
      });
    } else {
      await currentUser.follow(targetUserId);
      res.json({
        message: `Você agora segue ${targetUser.artistName || targetUser.name}`,
        isFollowing: true,
        followersCount: targetUser.followersCount + 1
      });
    }

  } catch (error) {
    console.error('Erro ao seguir/deixar de seguir:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/users/:id/followers
// @desc    Obter seguidores
// @access  Public
router.get('/:id/followers', [
  param('id').isMongoId().withMessage('ID do usuário inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.params.id)
      .populate({
        path: 'followers',
        select: 'name artistName avatar userType isVerified',
        options: { skip, limit: parseInt(limit) }
      });

    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      followers: user.followers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: user.followersCount,
        hasNext: skip + user.followers.length < user.followersCount
      }
    });

  } catch (error) {
    console.error('Erro ao buscar seguidores:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/users/:id/following
// @desc    Obter seguindo
// @access  Public
router.get('/:id/following', [
  param('id').isMongoId().withMessage('ID do usuário inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.params.id)
      .populate({
        path: 'following',
        select: 'name artistName avatar userType isVerified',
        options: { skip, limit: parseInt(limit) }
      });

    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      following: user.following,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: user.followingCount,
        hasNext: skip + user.following.length < user.followingCount
      }
    });

  } catch (error) {
    console.error('Erro ao buscar seguindo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// @route   GET /api/users/stats/genres
// @desc    Obter estatísticas de gêneros musicais
// @access  Public
router.get('/stats/genres', async (req, res) => {
  try {
    const genreStats = await User.aggregate([
      {
        $match: {
          userType: 'artist',
          isActive: true,
          genres: { $exists: true, $ne: [] }
        }
      },
      { $unwind: '$genres' },
      {
        $group: {
          _id: '$genres',
          count: { $sum: 1 },
          artists: {
            $push: {
              id: '$_id',
              name: '$name',
              artistName: '$artistName',
              avatar: '$avatar',
              isVerified: '$isVerified'
            }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    res.json({
      genres: genreStats.map(stat => ({
        genre: stat._id,
        count: stat.count,
        topArtists: stat.artists.slice(0, 5)
      }))
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas de gêneros:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;

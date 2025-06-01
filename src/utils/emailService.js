const nodemailer = require('nodemailer');

// Configuração do transporter de email
const createTransporter = () => {
  return nodemailer.createTransport({ // ✅ CORRIGIDO: createTransport (sem "er")
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Email genérico do sistema
      pass: process.env.EMAIL_PASS, // App password do email genérico
    },
  });
};

// Template de email para reset de senha
const createResetPasswordEmail = (userName, resetUrl, userEmail) => {
  return {
    subject: '🔑 Redefinir Senha - RockRider',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Redefinir Senha</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #0a0a0a; }
          .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); }
          .header { background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); padding: 30px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; color: #ffffff; }
          .button { display: inline-block; background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); color: #ffffff; padding: 15px 30px; border-radius: 25px; text-decoration: none; font-weight: bold; margin: 20px 0; }
          .footer { background: #1a1a1a; padding: 20px; text-align: center; color: #888; font-size: 12px; }
          .warning { background: #2d1b1b; border-left: 4px solid #ff4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .user-info { background: #2d2d2d; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎸 RockRider</h1>
          </div>
          
          <div class="content">
            <h2>Redefinição de Senha Solicitada</h2>
            
            <div class="user-info">
              <p><strong>📧 Conta:</strong> ${userEmail}</p>
              <p><strong>👤 Nome:</strong> ${userName}</p>
              <p><strong>⏰ Solicitado em:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            </div>
            
            <p>Recebemos uma solicitação para redefinir a senha desta conta no RockRider.</p>
            
            <p>Se você fez esta solicitação, clique no botão abaixo para criar uma nova senha:</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">🔑 Redefinir Senha</a>
            </div>
            
            <div class="warning">
              <p><strong>⚠️ Importante:</strong></p>
              <ul>
                <li>Este link expira em <strong>10 minutos</strong></li>
                <li>Se você não solicitou esta redefinição, ignore este email</li>
                <li>Nunca compartilhe este link com outras pessoas</li>
                <li>Por segurança, você será logado automaticamente após redefinir</li>
              </ul>
            </div>
            
            <p>Se o botão não funcionar, copie e cole este link no seu navegador:</p>
            <p style="word-break: break-all; background: #2d2d2d; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">${resetUrl}</p>
            
            <p style="margin-top: 30px;">Continue curtindo a música! 🎵</p>
            <p><strong>Equipe RockRider</strong><br>Sistema Automatizado</p>
          </div>
          
          <div class="footer">
            <p>© 2024 RockRider - Rede Social Musical</p>
            <p>Este é um email automático. Não responda a esta mensagem.</p>
            <p>Se você não solicitou esta redefinição, pode ignorar este email com segurança.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      🎸 RockRider - Redefinição de Senha
      
      Conta: ${userEmail}
      Nome: ${userName}
      Solicitado em: ${new Date().toLocaleString('pt-BR')}
      
      Recebemos uma solicitação para redefinir a senha desta conta no RockRider.
      
      Se você fez esta solicitação, acesse este link para criar uma nova senha:
      ${resetUrl}
      
      IMPORTANTE:
      - Este link expira em 10 minutos
      - Se você não solicitou esta redefinição, ignore este email
      - Nunca compartilhe este link com outras pessoas
      - Por segurança, você será logado automaticamente após redefinir
      
      Continue curtindo a música!
      Equipe RockRider - Sistema Automatizado
      
      © 2024 RockRider - Rede Social Musical
      Este é um email automático. Não responda a esta mensagem.
    `,
  };
};

// Enviar email de reset de senha
const sendResetPasswordEmail = async (userEmail, userName, resetToken) => {
  try {
    const transporter = createTransporter();
    
    // URL de reset para o app
    const resetUrl = `${process.env.FRONTEND_URL || 'exp://localhost:19000'}/--/reset-password?token=${resetToken}`;
    
    const emailContent = createResetPasswordEmail(userName, resetUrl, userEmail);
    
    const mailOptions = {
      from: {
        name: 'RockRider - Sistema 🎸',
        address: process.env.EMAIL_USER,
      },
      to: userEmail, // 📧 ENVIAR PARA O EMAIL DO USUÁRIO QUE ESQUECEU
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      replyTo: 'noreply@rockrider.com', // Email fictício para não resposta
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('📧 Email de reset enviado para:', userEmail);
    console.log('📧 Message ID:', info.messageId);
    console.log('⏰ Token expira em 10 minutos');
    
    return {
      success: true,
      messageId: info.messageId,
      sentTo: userEmail,
    };
    
  } catch (error) {
    console.error('❌ Erro ao enviar email para:', userEmail);
    console.error('❌ Erro detalhado:', error);
    throw new Error('Erro ao enviar email de redefinição');
  }
};

// Validar se email do sistema está configurado
const validateEmailConfig = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Configuração de email não encontrada. Verifique EMAIL_USER e EMAIL_PASS no .env');
  }
  
  console.log('✅ Email do sistema configurado:', process.env.EMAIL_USER);
  return true;
};

// Enviar email de boas-vindas (bonus para novos usuários)
const sendWelcomeEmail = async (userEmail, userName, userType) => {
  try {
    const transporter = createTransporter();
    
    const welcomeContent = {
      subject: `🎵 Bem-vindo ao RockRider, ${userName}!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #0a0a0a; }
            .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); }
            .header { background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); padding: 30px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; color: #ffffff; }
            .feature { background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎸 Bem-vindo ao RockRider!</h1>
            </div>
            
            <div class="content">
              <h2>Olá, ${userName}! 🎵</h2>
              
              <p>Sua conta foi criada com sucesso! Seja bem-vindo à maior rede social musical.</p>
              
              <p><strong>📧 Sua conta:</strong> ${userEmail}</p>
              <p><strong>👤 Tipo:</strong> ${userType === 'artist' ? '🎤 Artista' : '❤️ Fã'}</p>
              
              ${userType === 'artist' ? `
                <div class="feature">
                  <h3>🎤 Como Artista, você pode:</h3>
                  <ul>
                    <li>Compartilhar suas músicas e novidades</li>
                    <li>Divulgar seus shows e eventos</li>
                    <li>Conectar-se com seus fãs</li>
                    <li>Descobrir oportunidades de colaboração</li>
                  </ul>
                </div>
              ` : `
                <div class="feature">
                  <h3>❤️ Como Fã, você pode:</h3>
                  <ul>
                    <li>Seguir seus artistas favoritos</li>
                    <li>Descobrir novos eventos</li>
                    <li>Curtir e comentar posts</li>
                    <li>Encontrar novos estilos musicais</li>
                  </ul>
                </div>
              `}
              
              <p>Comece explorando e conectando-se com a comunidade musical!</p>
              
              <p>🎵 <strong>Equipe RockRider</strong></p>
            </div>
          </div>
        </body>
        </html>
      `,
    };
    
    const mailOptions = {
      from: {
        name: 'RockRider - Sistema 🎸',
        address: process.env.EMAIL_USER,
      },
      to: userEmail,
      subject: welcomeContent.subject,
      html: welcomeContent.html,
      replyTo: 'noreply@rockrider.com',
    };
    
    await transporter.sendMail(mailOptions);
    console.log('📧 Email de boas-vindas enviado para:', userEmail);
    
  } catch (error) {
    console.error('❌ Erro ao enviar email de boas-vindas:', error);
    // Não lançamos erro aqui pois não é crítico para o registro
  }
};

module.exports = {
  sendResetPasswordEmail,
  sendWelcomeEmail,
  validateEmailConfig,
};
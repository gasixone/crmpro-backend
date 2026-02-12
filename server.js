const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'crmpro-secret-key-2024';

// CORS - Tüm domainlere izin ver
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Basit JSON veritabanı
const DB_PATH = path.join(__dirname, 'database.json');

const initDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], contacts: [] }));
  }
};

const readDB = () => {
  initDB();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
};

const writeDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// E-posta gönderme (console log)
const sendEmail = async (to, subject, html) => {
  console.log('\n📧 ========== E-POSTA GÖNDERİLDİ ==========');
  console.log(`Kime: ${to}`);
  console.log(`Konu: ${subject}`);
  console.log('==========================================\n');
  return true;
};

// Doğrulama e-postası
const sendVerificationEmail = async (email, name, token) => {
  const verificationLink = `https://qj6f3oocsotmu.ok.kimi.link/verify?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #6366F1, #8B5CF6); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">CRMPro</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Merhaba ${name},</h2>
        <p style="color: #4b5563; font-size: 16px;">
          Hesabınızı aktifleştirmek için <a href="${verificationLink}">buraya tıklayın</a>.
        </p>
      </div>
    </div>
  `;
  
  return sendEmail(email, 'CRMPro - Hesap Doğrulama', html);
};

// ===== API ENDPOINTS =====

// Sağlık kontrolü
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'CRMPro API çalışıyor!', 
    timestamp: new Date().toISOString()
  });
});

// Kullanıcı kaydı
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, company, phone, plan = 'Başlangıç' } = req.body;
    
    if (!name || !email || !company) {
      return res.status(400).json({ success: false, message: 'Tüm zorunlu alanları doldurun.' });
    }
    
    const db = readDB();
    
    // E-posta kontrolü
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Bu e-posta adresi zaten kayıtlı.' });
    }
    
    const verificationToken = uuidv4();
    
    const newUser = {
      id: uuidv4(),
      name,
      email,
      company,
      phone: phone || null,
      plan,
      verified: true, // Demo: Otomatik doğrula
      verificationToken: null,
      createdAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    db.users.push(newUser);
    writeDB(db);
    
    await sendVerificationEmail(email, name, verificationToken);
    
    res.status(201).json({
      success: true,
      message: 'Hesabınız oluşturuldu! Lütfen e-postanızı kontrol edin.',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        plan: newUser.plan
      }
    });
    
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ success: false, message: 'Bir hata oluştu.' });
  }
});

// E-posta doğrulama
app.get('/api/auth/verify/:token', (req, res) => {
  try {
    const { token } = req.params;
    const db = readDB();
    
    const user = db.users.find(u => u.verificationToken === token);
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Geçersiz doğrulama bağlantısı.' });
    }
    
    if (user.verified) {
      return res.json({ success: true, message: 'Hesabınız zaten doğrulanmış.' });
    }
    
    user.verified = true;
    user.verifiedAt = new Date().toISOString();
    delete user.verificationToken;
    
    writeDB(db);
    
    res.json({ success: true, message: 'E-posta adresiniz doğrulandı!' });
    
  } catch (error) {
    res.status(500).json({ success: false, message: 'Bir hata oluştu.' });
  }
});

// Giriş yap
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const db = readDB();
    const user = db.users.find(u => u.email === email);
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }
    
       // Şifre kontrolü
    if (user.password !== password) {
      return res.status(400).json({ success: false, message: 'Şifre hatalı.' });
    }
    
    // Demo: E-posta doğrulama kontrolünü atla
    // if (!user.verified) {
    //   return res.status(400).json({ success: false, message: 'Lütfen önce e-posta adresinizi doğrulayın.' });
    // }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      message: 'Giriş başarılı!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company,
        plan: user.plan
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, message: 'Bir hata oluştu.' });
  }
});

// Mevcut kullanıcı
app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Yetkilendirme gerekli.' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = readDB();
    const user = db.users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }
    
    res.json({ success: true, user });
    
  } catch (error) {
    res.status(401).json({ success: false, message: 'Geçersiz token.' });
  }
});

// Tüm kullanıcılar
app.get('/api/users', (req, res) => {
  const db = readDB();
  res.json({ success: true, users: db.users });
});

// Kurumsal iletişim
app.post('/api/contact/enterprise', async (req, res) => {
  const { name, email, company, phone, message } = req.body;
  
  if (!name || !email || !company || !phone) {
    return res.status(400).json({ success: false, message: 'Tüm zorunlu alanları doldurun.' });
  }
  
  console.log('📨 Kurumsal talep:', { name, email, company });
  
  res.json({ success: true, message: 'Talebiniz alındı!' });
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 CRMPro API çalışıyor! Port: ${PORT}`);
});

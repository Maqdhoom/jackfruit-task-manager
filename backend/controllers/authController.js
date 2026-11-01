const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function createToken(userId) {
  const { JWT_SECRET } = process.env;

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1d' });
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    ...getCookieOptions(),
    maxAge: 24 * 60 * 60 * 1000,
  });
}

async function register(req, res) {
  const { name, email, password } = req.body ?? {};

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 80 ||
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 8
  ) {
    return res.status(400).json({
      message: 'Name, email, and a password of at least 8 characters are required',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    return res.status(409).json({ message: 'An account with this email already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  let user;

  try {
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    throw error;
  }

  setAuthCookie(res, createToken(user.id));
  return res.status(201).json({
    message: 'Registration successful',
    user: { id: user.id, name: user.name, email: user.email },
  });
}

async function login(req, res) {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  setAuthCookie(res, createToken(user.id));
  return res.json({
    message: 'Login successful',
    user: { id: user.id, name: user.name, email: user.email },
  });
}

function logout(req, res) {
  res.clearCookie('token', getCookieOptions());
  return res.json({ message: 'Logout successful' });
}

async function getMe(req, res) {
  const user = await User.findById(req.userId);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
}

module.exports = { register, login, logout, getMe };

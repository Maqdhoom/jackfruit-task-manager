const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  acceptProjectInvitation,
  getInvitationDetails,
} = require('../controllers/projectInvitationController');

const router = express.Router();

router.get('/:token', getInvitationDetails);
router.post('/:token/accept', authMiddleware, acceptProjectInvitation);

module.exports = router;

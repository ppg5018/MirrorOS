const express = require('express')
const router = express.Router()

router.get('/', (req, res) => {
  res.json({
    unread: 3,
    contacts: [
      { name: 'Rahul',        preview: 'Bhai kal milte hain?', count: 1 },
      { name: 'Mom',          preview: 'Khana khaya?',         count: 1 },
      { name: 'Family Group', preview: 'Photo shared',         count: 1 }
    ]
  })
})

module.exports = router

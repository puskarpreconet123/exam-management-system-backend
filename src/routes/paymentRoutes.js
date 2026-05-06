const router = require("express").Router();
const paymentCtrl = require("../controllers/paymentController");

router.post("/create-order", paymentCtrl.createOrder);
router.post("/verify-payment", paymentCtrl.verifyPayment);
router.post("/webhook", paymentCtrl.handleWebhook);

module.exports = router;

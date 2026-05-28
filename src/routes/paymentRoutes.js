const router = require("express").Router();
const paymentCtrl = require("../controllers/paymentController");
const auth = require("../middleware/auth");

router.post("/create-order", auth, paymentCtrl.createOrder);
router.post("/verify-payment", auth, paymentCtrl.verifyPayment);
router.post("/webhook", paymentCtrl.handleWebhook);

module.exports = router;

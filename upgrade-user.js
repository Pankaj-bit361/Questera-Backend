const mongoose = require('mongoose');
const User = require('./models/user');
const Credits = require('./models/credits');

const PLAN_CONFIG = {
  business: {
    name: 'Velos Business',
    credits: 1500,
    price: 4500,
    razorpayPlanId: 'plan_RWN709UXPBQVrW',
  },
};

async function upgradeUser() {
  try {
    // Load env from parent directory
    require('dotenv').config({ path: './.env' });
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email: 'pnkjvshsht1@gmail.com' });
    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }
    console.log('✅ Found user:', user.email);

    // Find or create credits record
    let credits = await Credits.findOne({ userId: user.userId });
    if (!credits) {
      credits = await Credits.create({
        userId: user.userId,
        balance: PLAN_CONFIG.business.credits,
        plan: 'business',
        planName: PLAN_CONFIG.business.name,
        subscriptionStatus: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        transactions: [{
          type: 'subscription',
          amount: PLAN_CONFIG.business.credits,
          description: 'Business plan - Manual upgrade',
          referenceType: 'subscription',
          balanceAfter: PLAN_CONFIG.business.credits,
        }],
      });
      console.log('✅ Created new credits record');
    } else {
      // Update existing credits
      credits.balance = PLAN_CONFIG.business.credits;
      credits.plan = 'business';
      credits.planName = PLAN_CONFIG.business.name;
      credits.subscriptionStatus = 'active';
      credits.currentPeriodStart = new Date();
      credits.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      credits.transactions.push({
        type: 'subscription',
        amount: PLAN_CONFIG.business.credits,
        description: 'Business plan - Manual upgrade',
        referenceType: 'subscription',
        balanceAfter: PLAN_CONFIG.business.credits,
      });
      await credits.save();
      console.log('✅ Updated existing credits record');
    }

    console.log('\n✅ User upgraded to Business plan!');
    console.log('📊 Credits:', credits.balance);
    console.log('📅 Plan:', credits.planName);
    console.log('🔄 Status:', credits.subscriptionStatus);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

upgradeUser();


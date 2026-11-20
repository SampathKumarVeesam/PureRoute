import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectToDatabase, DB_NAME, seedDatabaseIfEmpty } from '../server/database.ts';
import {
  UserModel,
  ProductModel,
  OrderModel,
  SubscriptionModel,
  ReviewModel,
  EmailLogModel,
  FeedbackPrefModel,
} from '../server/models/index.ts';
import { getStore } from '../server/store.ts';

dotenv.config();

async function initDatabase() {
  console.log(`=======================================================`);
  console.log(`🍃 PureRoute MongoDB Atlas Initialization Script`);
  console.log(`🍃 Target Database: ${DB_NAME}`);
  console.log(`=======================================================`);

  const conn = await connectToDatabase();
  if (!conn) {
    console.error('❌ Failed to connect to MongoDB Atlas. Please check MONGODB_URI.');
    process.exit(1);
  }

  console.log('⚡ Initializing collection schemas & building indexes...');

  await Promise.all([
    UserModel.init(),
    ProductModel.init(),
    OrderModel.init(),
    SubscriptionModel.init(),
    ReviewModel.init(),
    EmailLogModel.init(),
    FeedbackPrefModel.init(),
  ]);

  console.log('✅ Indexes verified on all 7 collections:');
  console.log('   - users (email unique, id unique, role)');
  console.log('   - products (id unique, merchantId)');
  console.log('   - orders (orderNumber unique, customerId, assignedAgentId, status)');
  console.log('   - subscriptions (id unique, customerId, status)');
  console.log('   - reviews (id unique, productId, customerId)');
  console.log('   - email_logs (id unique)');
  console.log('   - feedback_preferences (userId unique)');

  console.log('🌱 Seeding sample data from domain store...');
  const store = getStore();

  await seedDatabaseIfEmpty({
    users: store.users,
    products: store.products,
    orders: store.orders,
    subscriptions: store.subscriptions,
    reviews: store.reviews,
  });

  const [usersCount, prodsCount, ordersCount, subsCount, reviewsCount] = await Promise.all([
    UserModel.countDocuments(),
    ProductModel.countDocuments(),
    OrderModel.countDocuments(),
    SubscriptionModel.countDocuments(),
    ReviewModel.countDocuments(),
  ]);

  console.log(`\n🎉 MongoDB Atlas Setup Complete! Collection statistics:`);
  console.log(`   - users: ${usersCount} documents`);
  console.log(`   - products: ${prodsCount} documents`);
  console.log(`   - orders: ${ordersCount} documents`);
  console.log(`   - subscriptions: ${subsCount} documents`);
  console.log(`   - reviews: ${reviewsCount} documents`);
  console.log(`\nOpen MongoDB Compass -> connect to cluster0.nbcjv7c.mongodb.net -> explore "${DB_NAME}".`);

  await mongoose.disconnect();
  process.exit(0);
}

initDatabase().catch((err) => {
  console.error('❌ Error during database initialization:', err);
  process.exit(1);
});

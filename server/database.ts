import mongoose from 'mongoose';
import dotenv from 'dotenv';
import {
  UserModel,
  ProductModel,
  OrderModel,
  SubscriptionModel,
  ReviewModel,
  EmailLogModel,
  FeedbackPrefModel,
} from './models/index.ts';

dotenv.config();

const DEFAULT_MONGO_URI =
  'mongodb+srv://sampathkumarveesam_db_user:JcmCdcGzU63XDU3h@cluster0.3pcz0ia.mongodb.net/app_production?retryWrites=true&w=majority&appName=Cluster0';

export const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGO_URI;
export const DB_NAME = process.env.DB_NAME || 'app_production';

interface DatabaseHealth {
  status: 'connected' | 'connecting' | 'disconnected';
  database: string;
  host: string;
  collections?: { name: string; count: number }[];
  latencyMs?: number;
  error?: string;
}

let isConnecting = false;

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    return null;
  }

  isConnecting = true;
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    console.log(`🍃 [MongoDB Atlas] Connected to database: ${DB_NAME} at ${mongoose.connection.host}`);
    isConnecting = false;

    // Graceful process shutdown handling
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      process.exit(0);
    });

    return mongoose;
  } catch (err: any) {
    isConnecting = false;
    console.error('🍃 [MongoDB Atlas] Connection error:', err.message);
    return null;
  }
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const readyState = mongoose.connection.readyState;
  const host = mongoose.connection.host || 'cluster0.3pcz0ia.mongodb.net';

  if (readyState !== 1) {
    return {
      status: readyState === 2 ? 'connecting' : 'disconnected',
      database: DB_NAME,
      host,
      error: 'Database is not currently connected.',
    };
  }

  const start = Date.now();
  try {
    await mongoose.connection.db?.admin().ping();
    const latencyMs = Date.now() - start;

    const [usersCount, productsCount, ordersCount, subsCount, reviewsCount, logsCount] = await Promise.all([
      UserModel.countDocuments(),
      ProductModel.countDocuments(),
      OrderModel.countDocuments(),
      SubscriptionModel.countDocuments(),
      ReviewModel.countDocuments(),
      EmailLogModel.countDocuments(),
    ]);

    return {
      status: 'connected',
      database: DB_NAME,
      host,
      latencyMs,
      collections: [
        { name: 'users', count: usersCount },
        { name: 'products', count: productsCount },
        { name: 'orders', count: ordersCount },
        { name: 'subscriptions', count: subsCount },
        { name: 'reviews', count: reviewsCount },
        { name: 'email_logs', count: logsCount },
      ],
    };
  } catch (err: any) {
    return {
      status: 'disconnected',
      database: DB_NAME,
      host,
      error: err.message,
    };
  }
}

export async function seedDatabaseIfEmpty(initialData: {
  users: any[];
  products: any[];
  orders: any[];
  subscriptions: any[];
  reviews: any[];
}): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  try {
    const userCount = await UserModel.countDocuments();
    if (userCount === 0 && initialData.users.length > 0) {
      console.log('🍃 [MongoDB Seed] Populating users collection in app_production...');
      await UserModel.insertMany(initialData.users);
    }

    const prodCount = await ProductModel.countDocuments();
    if (prodCount === 0 && initialData.products.length > 0) {
      console.log('🍃 [MongoDB Seed] Populating products collection in app_production...');
      await ProductModel.insertMany(initialData.products);
    }

    const orderCount = await OrderModel.countDocuments();
    if (orderCount === 0 && initialData.orders.length > 0) {
      console.log('🍃 [MongoDB Seed] Populating orders collection in app_production...');
      await OrderModel.insertMany(initialData.orders);
    }

    const subCount = await SubscriptionModel.countDocuments();
    if (subCount === 0 && initialData.subscriptions.length > 0) {
      console.log('🍃 [MongoDB Seed] Populating subscriptions collection in app_production...');
      await SubscriptionModel.insertMany(initialData.subscriptions);
    }

    const revCount = await ReviewModel.countDocuments();
    if (revCount === 0 && initialData.reviews.length > 0) {
      console.log('🍃 [MongoDB Seed] Populating reviews collection in app_production...');
      await ReviewModel.insertMany(initialData.reviews);
    }
  } catch (err: any) {
    console.warn('🍃 [MongoDB Seed] Warning during seeding:', err.message);
  }
}

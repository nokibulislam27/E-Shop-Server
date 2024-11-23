require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 3001;
const corsOptions = {
    origin: ['https://lit-lounge-store.vercel.app'],
    optionsSuccessStatus: 200
}
app.use(cors(corsOptions));
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zrua0aj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
// custom middlewares 
const verifyToken = async (req, res, next) => {
    // token correctly coming
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = req.headers.authorization;
    jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        const db = client.db('ShopNow-DB');
        const usersCollection = db.collection('users');
        const productsCollection = db.collection('products');
        const paymentsCollection = db.collection('payments');
        // role verification middlewares
        const verifyCustomer = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isCustomer = user?.role === 'customer';
            if (!isCustomer) {
                return res.status(403).send({ massage: "forbidden access" });
            }
            next();
        }
        const verifySeller = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isSeller = user?.role === 'seller';
            if (!isSeller) {
                return res.status(403).send({ massage: "forbidden access" });
            }
            next();
        }
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email; // quick fix
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ massage: "forbidden access" });
            }
            next();
        }
        // ping db
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
        // all api endpoints
        // users endpoints
        app.post('/users', async (req, res) => {
            try {
                const user = req.body;
                const query = { email: user.email };
                const existingEmail = await usersCollection.findOne(query);
                if (existingEmail) {
                    return res.send({ massage: "User already exits" });
                }
                const result = await usersCollection.insertOne(user);
                res.status(200).send(result);
            }
            catch (error) {
                console.error("Error massage ", error.massage);
                res.status(500).send({ massage: "Internal server error" });
            }
        })
        // get an single users
        app.get(`/user`, verifyToken, async (req, res) => {
            try {
                const { email } = req.query;
                if (!email) {
                    return res.status(400).json({ massage: "Email query parameter is required" });
                }
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({ message: 'User not found with the provided email.' });
                }
                res.status(200).json(user);
            }
            catch (error) {
                console.error('Error fetching user:', error.message);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        })
        // get all cart items for customers
        app.get('/cart-items', verifyToken, verifyCustomer, async (req, res) => {
            try {
                const { email } = req.query;
                if (!email) {
                    return res.status(400).json({ message: "Email is required" });
                }
                const user = await usersCollection.findOne({ email }, { projection: { cart: 1, _id: 0 } });
                if (!user) {
                    return res.status(404).json({ message: "User not found with the provided email" });
                }
                const cartProductIds = user.cart || [];
                if (cartProductIds.length === 0) {
                    return res.status(200).json({ cart: [] });
                }
                // Fetch all products from productsCollection based on cartProductIds
                const cartProducts = await productsCollection.find({ _id: { $in: cartProductIds.map(id => new ObjectId(id)) } }).toArray();
                return res.status(200).json({ cart: cartProducts });
            } catch (error) {
                console.error(error);
                return res.status(500).json({ message: 'Internal server error', error: error.message });
            }
        });
        // get all wishlist items for customers
        app.get('/wishlist-items', verifyToken, verifyCustomer, async (req, res) => {
            try {
                const { email } = req.query;
                if (!email) {
                    return res.status(400).json({ message: "Email is required" });
                }
                const user = await usersCollection.findOne({ email }, { projection: { wishlist: 1, _id: 0 } });
                if (!user) {
                    return res.status(404).json({ message: "User not found with the provided email" });
                }
                const wishlistProductIds = user.wishlist || [];
                if (wishlistProductIds.length === 0) {
                    return res.status(200).json({ wishlist: [] });
                }
                // Fetch all products from productsCollection based on wishlistProductIds
                const wishlistProducts = await productsCollection.find({ _id: { $in: wishlistProductIds.map(id => new ObjectId(id)) } }).toArray();
                return res.status(200).json({ wishlist: wishlistProducts });
            } catch (error) {
                console.error(error);
                return res.status(500).json({ message: 'Internal server error', error: error.message });
            }
        });
        // remove cart items for customers
        app.delete('/cart-items/:id', verifyToken, verifyCustomer, async (req, res) => {
            try {
                const productId = req.params.id;
                const email = req.query.email;
                if (!ObjectId.isValid(productId)) {
                    return res.status(400).json({ message: 'Invalid product ID' });
                }
                const user = await usersCollection.findOne({ email: email });

                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }
                const result = await usersCollection.updateOne(
                    { email: email },
                    { $pull: { cart: productId } }
                );
                if (result.modifiedCount === 0) {
                    return res.status(404).json({ message: 'Product not found in cart' });
                }
                res.status(200).json({ message: 'Product removed from cart successfully' });
            } catch (error) {
                console.error('Error deleting cart item:', error.message);
                res.status(500).json({ message: 'An error occurred while removing the product from cart' });
            }
        });

        // remove wishlist items for customers
        app.delete('/wishlist-items/:id', verifyToken, verifyCustomer, async (req, res) => {
            try {
                const productId = req.params.id;
                const email = req.query.email;
                if (!ObjectId.isValid(productId)) {
                    return res.status(400).json({ message: 'Invalid product ID' });
                }
                const user = await usersCollection.findOne({ email: email });
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }
                const result = await usersCollection.updateOne(
                    { email: email },
                    { $pull: { wishlist: productId } }
                );
                if (result.modifiedCount === 0) {
                    return res.status(404).json({ message: 'Product not found in wishlist' });
                }
                res.status(200).json({ message: 'Product removed from wishlist successfully' });
            } catch (error) {
                console.error('Error deleting wishlist product:', error.message);
                res.status(500).json({ message: 'An error occurred while deleting the product from wishlist' });
            }
        });

        // add products to customer cart
        app.patch('/cart', async (req, res) => {
            try {
                const { id, email } = req.query;
                if (!id || !email) {
                    return res.status(400).json({ message: "Product ID and email are required" });
                }
                const query = { email };
                const user = await usersCollection.findOne(query);
                if (!user) {
                    return res.status(404).json({ message: "User not found with the provided email" });
                }
                if (user.cart && user.cart.includes(id)) {
                    return res.status(400).json({ message: "Product is already in the cart" });
                }
                if (user.wishlist && user.wishlist.includes(id)) {
                    await usersCollection.updateOne(
                        { email },
                        { $pull: { wishlist: id } }
                    );
                }
                // Add the product to the cart
                const updatedUser = await usersCollection.updateOne(
                    { email }, // Match by the user's email
                    { $push: { cart: id } }
                );

                if (updatedUser.matchedCount === 0) {
                    return res.status(404).json({ message: 'User not found' });
                }
                return res.status(200).json({ message: 'Product added to cart successfully' });
            } catch (error) {
                console.error(error);
                return res.status(500).json({ message: 'Internal server error', error: error.message });
            }
        });
        // add products to customer wishlist 
        app.patch('/wishlist', async (req, res) => {
            try {
                const { id, email } = req.query;
                if (!id || !email) {
                    return res.status(400).json({ message: "Product ID and email are required" });
                }
                const query = { email };
                const user = await usersCollection.findOne(query);
                if (!user) {
                    return res.status(404).json({ message: "User not found with the provided email" });
                }
                if (user.cart && user.cart.includes(id)) {
                    return res.status(400).json({ message: "Product is already in the cart" });
                }
                if (user.wishlist && user.wishlist.includes(id)) {
                    return res.status(400).json({ message: "Product is already in the wishlist" });
                }
                const updatedUser = await usersCollection.updateOne(
                    { email }, // Match by the user's email
                    { $push: { wishlist: id } } // Push the new 'id' into the 'wishlist' array
                );
                if (updatedUser.matchedCount === 0) {
                    return res.status(404).json({ message: 'User not found' });
                }

                return res.status(200).json({ message: 'Product added to wishlist successfully' });
            } catch (error) {
                console.error(error);
                return res.status(500).json({ message: 'Internal server error', error: error.message });
            }
        });
        // get all users
        app.get('/all-users', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const totalUsers = await usersCollection.countDocuments();
                const users = await usersCollection.find().toArray();
                res.status(200).send({ users, totalUsers });
            } catch (error) {
                console.error('Error fetching user:', error.message);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        })
        // change user role
        app.patch('/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
            try {
                console.log("server hit on it.....");
                const userId = req.params.id;
                const { role } = req.body;
                const validRoles = ['admin', 'customer', 'seller'];
                if (!validRoles.includes(role)) {
                    return res.status(400).json({ massage: "Invalid role specified" });
                }
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { role } }
                )
                if (result.modifiedCount === 0) {
                    return res.status(404).json({ message: 'User not found or role not updated' });
                }
                res.status(200).send({ message: 'User role updated successfully', updatedRole: role });
            } catch (error) {
                console.error('Error updating user role:', error.message);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        })
        // delete a user
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const userId = req.params.id;
                const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }
                const deleteResult = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
                if (deleteResult.deletedCount === 0) {
                    return res.status(404).json({ message: 'Failed to delete user' });
                }
                if (user.role === 'seller') {
                    const productsResult = await productsCollection.deleteMany({ sellerEmail: user.email });
                }
                res.status(200).json({ message: 'User and associated data deleted successfully' });
            } catch (error) {
                console.error('Error deleting user or products:', error.message);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        })
        // Create a product
        app.post('/products', verifyToken, verifySeller, async (req, res) => {
            try {
                const productData = req.body;
                const result = await productsCollection.insertOne(productData);
                res.status(201).send(result);
            }
            catch (error) {
                console.error('Error adding product:', error.message);
                res.status(500).send({ message: 'An error occurred while adding the product' });
            }
        })
        // Get all products
        app.get('/products', async (req, res) => {
            try {
                const { title, sort, category, brand, page = 1, limit = 6 } = req.query;
                const query = {};
                if (title) query.productName = { $regex: title, $options: 'i' };
                if (category) query.productCategory = category;
                if (brand) query.productBrand = brand;
                const pageNumber = parseInt(page, 10) || 1;
                const limitNumber = parseInt(limit, 10) || 6;
                const sortOptions = sort === 'asc' ? 1 : -1;
                const products = await productsCollection
                    .find(query)
                    .skip((pageNumber - 1) * limitNumber)
                    .sort({ productPrice: sortOptions })
                    .limit(limitNumber)
                    .toArray();
                const totalProducts = await productsCollection.countDocuments(query);
                const allProducts = await productsCollection.find({}).toArray();
                const productBrand = [...new Set(allProducts.map((p) => p.productBrand))];
                const productCategory = [...new Set(allProducts.map((p) => p.productCategory))];
                res.status(200).json({
                    products,
                    productBrand,
                    productCategory,
                    totalProducts,
                    pageNumber,
                    limit: limitNumber
                });
            }
            catch (error) {
                console.error('Error fetching products:', error.message);
                res.status(500).send({ message: 'An error occurred while fetching products.' });
            }
        })
        // Get seller own products
        app.get('/my-products', verifyToken, verifySeller, async (req, res) => {
            try {
                const email = req.query.email;
                if (!email) {
                    return res.status(400).send({ message: 'Email is required' }); // Handle missing email
                }
                const query = { sellerEmail: email }; // Construct the query
                const myProducts = await productsCollection.find(query).toArray(); // Fetch products matching the email
                res.status(200).send(myProducts);
            } catch (error) {
                console.error('Error getting own products:', error.message);
                res.status(500).send({ message: 'An error occurred while getting own products' });
            }
        });
        // Get a single products
        app.get('/products/:id', async (req, res) => {
            const { id } = req.params;
            try {
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ massage: "Invalid product id format" });
                }
                const product = await productsCollection.findOne({ _id: new ObjectId(id) });
                if (!product) {
                    return res.status(404).json({ massage: "Product not found" });
                }
                res.status(200).json(product);
            }
            catch (error) {
                console.error('Error get single product:', error.message);
                res.status(500).send({ message: 'An error occurred while get a single product' });
            }
        })
        app.put('/products/:id', verifyToken, verifySeller, async (req, res) => {
            try {
                const productId = req.params.id; // Get the ID from the route params
                const updatedData = req.body;
                if (!ObjectId.isValid(productId)) {
                    return res.status(400).json({ message: 'Invalid product ID' });
                }
                if (updatedData._id) {
                    delete updatedData._id;
                }
                // Perform the update operation
                const result = await productsCollection.updateOne(
                    { _id: new ObjectId(productId) }, // Create an ObjectId instance
                    { $set: updatedData }
                );

                // Handle scenarios
                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "Product not found" });
                }

                if (result.modifiedCount === 0) {
                    return res.status(400).json({ message: 'No changes were made to the product' });
                }

                // Success response
                res.status(200).json({ message: "Product updated successfully" });
            } catch (error) {
                console.error('Error updating single product:', error.message);
                res.status(500).json({ message: 'An error occurred while updating the product' });
            }
        });
        app.delete('/products/:id', verifyToken, verifySeller, async (req, res) => {
            try {
                const productId = req.params.id; // Get the product ID from the route params
                // Check if the productId is a valid ObjectId
                if (!ObjectId.isValid(productId)) {
                    return res.status(400).json({ message: 'Invalid product ID' });
                }

                // Perform the delete operation
                const result = await productsCollection.deleteOne(
                    { _id: new ObjectId(productId) } // Match the product by _id
                );
                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: 'Product not found' });
                }
                // Success response
                res.status(200).json({ message: 'Product deleted successfully' });
            } catch (error) {
                console.error('Error deleting single product:', error.message);
                res.status(500).json({ message: 'An error occurred while deleting the product' });
            }
        });
        // Fake Payment api
        app.post('/create-payment', verifyToken, verifyCustomer, async (req, res) => {
            try {
                const email = req.query.email;
                const { productIds, payableAmount } = req.body;

                // Validate the input
                if (!email || !Array.isArray(productIds) || productIds.length === 0 || !payableAmount) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid input: Please provide email, productIds (array), and payableAmount.",
                    });
                }

                // Find the user by email
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: "User not found.",
                    });
                }

                // Check if all productIds exist in the user's cart
                const cartProducts = user.cart || [];
                const missingProducts = productIds.filter(id => !cartProducts.includes(id));
                if (missingProducts.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Some products are not in the cart: ${missingProducts.join(', ')}`,
                    });
                }

                // Clear the user's cart
                const updateResult = await usersCollection.updateOne(
                    { email },
                    { $set: { cart: [] } }
                );

                if (updateResult.modifiedCount === 0) {
                    return res.status(500).json({
                        success: false,
                        message: "Failed to clear the cart.",
                    });
                }

                // Generate transaction ID and payment time
                const transactionId = uuidv4();
                const paymentTime = moment().format('YYYY-MM-DD HH:mm:ss');

                // Prepare payment data with only product IDs
                const paymentData = {
                    customerEmail: email,
                    productIds, // Only store product IDs
                    transactionId,
                    paymentTime,
                    payableAmount,
                };

                // Insert payment record into the database
                await paymentsCollection.insertOne(paymentData);

                res.status(200).json({
                    success: true,
                    data: paymentData,
                });
            } catch (error) {
                console.error(error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        });

        app.get('/payments-info', verifyToken, verifyCustomer, async (req, res) => {
            try {
                const email = req.query.email;
                const query = { customerEmail: email };
                const result = await paymentsCollection.find(query).toArray();
                res.status(200).send(result);
            }
            catch (error) {
                console.error(error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        })
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
    res.status(200).send("ShopNow Server is running!!");
})
// jwt
app.post('/auth', async (req, res) => {
    const userEmail = req.body;
    const token = jwt.sign(userEmail, process.env.JWT_ACCESS_TOKEN, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.send({ token });
})
app.listen(port, () => {
    console.log(`Server listening at port ${port}`);
})

//config to use file env
const dotenv = require("dotenv").config({ path: __dirname + "/.env" });


// Expressjs hỗ trợ các method HTTP và midleware tạo ra API vô cùng mạnh mẽ và dễ sử dụng.
// Tổng hợp một số chức năng chính của Expressjs như sau:
// Thiết lập các lớp trung gian để trả về các HTTP request.
// Define router cho phép sử dụng với các hành động khác nhau dựa trên phương thức HTTP và URL.
// Cho phép trả về các trang HTML dựa vào các tham số.
const express = require('express');

// Phải viết line này vì cần có 1 biến số để giữ 
// Express application mới của mình.Express không phải là phần mặc định của Node.
const app = express();

//get random id
const { v4: uuid } = require('uuid');

// config path 
const path = require('path');

//config server side
app.use(express.static('./views'));
app.set('view engine', 'ejs');
app.set('views', './views');

// app.use(\'/test\', cb);
// Nó sẽ chỉ match với request bắt đầu với / test

// bodyParser.json() trả về một function và khi function đó được dùng làm đối số cho app.use,
//     nó hoạt động giống như bất kỳ middleware khác.

// config aws dynamodb
const AWS = require('aws-sdk');
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
})

// Get dynodb in client
const docClient = new AWS.DynamoDB.DocumentClient()

const tableName = 'SinhVien'

// config s3
const s3 = new AWS.S3();

const multer = require('multer');

const storage = multer.memoryStorage({
    destination(req, res, callback) {
        callback(null, '');
    },
});

const checkFileType = (file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/

    const extName = fileTypes.test(path.extname(file.originalname.toLowerCase()));
    const minetype = fileTypes.test(file.mimetype);

    if (minetype && extName) return cb(null, true);

    return cb('Error: Image only');
}

const upload = multer({
    storage,
    limits: { filesize: 2000000 },
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    }
});

const CLOUD_FRONT_URL = 'https://d2rd596stqiu8q.cloudfront.net/';

const checkValidation = ({ ma_sv, ten_sv, ngaySinh, lop_sv }, res) => {
    console.log('🚀 ~ file: main.js ~ line 63 ~ checkValidation ~ ma_sv', ma_sv)
    console.log(
        '🚀 ~ file: main.js ~ line 63 ~ checkValidation ~ ma_sv',
        /^\d+$/.test(ma_sv)
    )
    const CHECK_MA = /^\d+$/
    const CHECK_TEN = /^[a-z]([-']?[a-z]+)*( [a-z]([-']?[a-z]+)*)+$/
    const CHECK_DATE = Date.now() - new Date(ngaySinh?.toString()).getTime()
    if (!CHECK_MA.test(ma_sv)) {
        return res.send('Mã sinh viên phải là 1 chuỗi số')
    } else if (CHECK_TEN.test(ten_sv)) {
        return res.send('Tên sinh viên không được chứa ký tự đặc biệt hoặc số')
    } else if (CHECK_DATE < 0) {
        return res.send('Ngày sinh phải lớn hơn ngày hiện tại')
    }
}

// Routes cho phép chúng ta soạn thảo(script) các hành động dựa trên path.Các options 
// sẽ là GET, POST, PUT & DELETE
app.post('/', upload.single(['image']), (req, res, next) => {
    const { ma_sv, ten_sv, ngaySinh, lop_sv } = req.body

    //CHECK INPUT IF NOT VALID
    const CHECK_MA = /^\d+$/
    const CHECK_TEN = /^[a-z]([-']?[a-z]+)*( [a-z]([-']?[a-z]+)*)+$/
    const CHECK_DATE = Date.now() - new Date(ngaySinh?.toString()).getTime()
    if (!CHECK_MA.test(ma_sv)) {
        return res.send('Mã sinh viên phải là 1 chuỗi số')
    } else if (!CHECK_TEN.test(ten_sv)) {
        return res.send(
            'Tên sinh viên không được chứa ký tự đặc biệt hoặc số và phải lớn hơn 2 từ'
        )
    } else if (ngaySinh.length < 1 || CHECK_DATE < 0) {
        return res.send('Ngày sinh phải nhỏ hơn ngày hiện tại')
    } else if (lop_sv.trim().length < 1) {
        return res.send('Lớp không được để trống')
    } else if (!req.file) {
        return res.send('Vui Lòng thêm hình')
    }

    // handle image
    const image = req.file?.originalname.split('.')

    const fileType = image[image?.length - 1]
    const filePath = `${uuid() + Date.now().toString()}.${fileType}`

    const params = {
        Bucket: 'imagecanhcut',
        Key: filePath,
        Body: req.file.buffer,
    }

    s3.upload(params, (error, data) => {
        if (error) {
            return res.send('Internal Server Error')
        } else {
            const newItem = {
                TableName: tableName,
                Item: {
                    ma_sv,
                    ten_sv,
                    ngaySinh,
                    lop_sv,
                    image_url: `${CLOUD_FRONT_URL}${filePath}`,
                },
            }

            docClient.put(newItem, (err, data) => {
                if (err) {
                    return res.send('Internal server error')
                } else {
                    return res.redirect('/')
                }
            })
        }
    })
});

app.get('/', (req, res, next) => {
    const params = {
        TableName: tableName,
    }
    docClient.scan(params, (err, data) => {
        if (err) {
            console.log(err)
            return res.send('Internal server error')
        } else {
            return res.render('index', { data: data.Items })
        }
    })
});

app.post('/delete', upload.fields([]), (req, res) => {
    const { ma_sv } = req.body

    const params = {
        TableName: tableName,
        Key: {
            ma_sv,
        },
    }

    docClient.delete(params, (err, data) => {
        if (err) {
            return res.send('Internal server error')
        } else {
            return res.redirect('/')
        }
    })
});

app.listen(3000, () => {
    console.log('Server is running on port 3000!')
});
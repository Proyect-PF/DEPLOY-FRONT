import {Express, Request, Response, response} from "express";
import {request} from "http";
import {Op} from "sequelize";
import db from "../database/database";
import cloudinary from "../utils/cloudinary";
import getErrorMessage from "../helpers/handleErrorCatch";
import { TypeProduct } from "../types";

// LOS PRODUCT EN LA BASE DE DATOS TIENEN ESTA INFO TAMBIEN, Y NO QUEREMOS TOMARLA. ASIQUE USAMOS ...TO_EXCLUDE en la query, para todos
// los endpoint
const TO_EXCLUDE = [
    "video",
    "stock",
    "height",
    "weight",
    "width",
    "length",
    "SKU",
    "barcode",
    "createdAt",
    "updatedAt",
    "adminId",
    "id_category",
];

// Aca se definen funciones que INTERACTUAN con nuestar base de datos

export const GET_ProductById = async (request: Request, response: Response) => {
    const {id} = request.params;
    if (!id) return response.status(400).json("No se ha proporcionado un ID de producto A BUSCAR");
    try {
        const product = await db.Product.findOne({
            where: {id},
            attributes: {exclude: TO_EXCLUDE}
        });
        if (!product) return response.status(204).json("Producto no encontrado");
        return response.status(200).json(product);
    } catch (error: any) {
        return response.status(400).json({error: error.message});
    }
};

export const POST_NewProduct = async (req: Request, res: Response) => {
    let {image, promotional_price, promotion} = req.body
    try {
        if(image){
            const uploadRes = await cloudinary.uploader.upload(image, {
                upload_preset: 'unbardo'
            })
            req.body.image = uploadRes.url
        }else {
            //Si no se envia ninguna imagen dejar un string para probar postear productos y no generar errores al usar cloudinary
            req.body.image = "image"
        }

        //Si no llega ningun precio promocional, se deja el estado de promocion en false, por defecto el estado es en falso
        if(!promotional_price) {
            req.body.promotion = false
        }else{
            req.body.promotion = true
        }
        const newProduct:TypeProduct = await db.Product.create(req.body);
        return res.status(201).json(newProduct);
    } catch (error) {
        console.log(typeof error)
        return res.status(400).json(getErrorMessage(error));
    }
};

export const GET_SearchByName = async (
    request: Request,
    response: Response
) => {
    const {name} = request.params;
    if (!name) return response.status(400).json("No se ha proporcionado un NOMBRE de producto");
    try {
        const products = await db.Product.findAll({
            where: {
                name: {[Op.iLike]: `%${name}%`},
            },
            attributes: {
                exclude: TO_EXCLUDE,
            },
        });
        return response.status(200).json(products);

    } catch (error: any) {
        return response.status(400).json({error: error.message});

    }
};

export const DELETE_DeleteProduct = async (
    request: Request,
    response: Response
) => {
    const {id} = request.params;
    if (!id) return response.status(400).json("No se ha proporcionado un ID de producto A ELIMINAR");
    try {
        const deletedProduct = await db.Product.destroy({where: {id}});
        return response.status(200).json(deletedProduct);
    } catch (error: any) {
        return response.status(500).json({error: error.message});

    }
};

export const DELETE_DeleteAllProducts = async (
    request: Request,
    response: Response
) => {
    try {
        const count = await db.Product.count();
        if (count === 0) {
            return response.status(404).json({message: "No se encontraron productos para eliminar"});
        }

        const deletedProducts = await db.Product.destroy({where: {}});
        return response.status(200).json({
            message: `Se han eliminado ${deletedProducts} productos`,
        });
    } catch (error: any) {
        return response.status(500).json({
            error: error.message,
            message: "Ocurrió un error al eliminar todos los productos",
        });
    }
};


export const GET_AllProducts = async (request: Request, response: Response) => {
    try {
        const {id} = request.params;
        const {name, filter, filter2, order, page, perPage, sort} = request.query;
        console.log(request.query)

        // Seteamos el optiones BASE de consulta
        let options: any = {
            include: db.Category,
            attributes: {
                exclude: TO_EXCLUDE,
            },
        };

        // Tomamos filters y lo parseamos a string, esto es por si hay un problema al recibir undefined o null o algo
        if (filter || filter2 || name) {
            let where: any = {};
            if (filter === "black" || filter === "white") {
                where.color = filter
            }else if(filter === 'show' || filter === "hidden"){
                where.show_in_shop = filter === 'show'
            }
            if(filter2 === 'out'){
                where.S = 0
                where.L = 0
                where.M = 0
                where.XL = 0
            }
            if(filter2 === 'promo'){
                where.promotion = true;
            }
            if(name){
                where.name = {[Op.iLike]: `%${name}%`}
            }
            options.where = where;
        }
        // Ordenamos por la columna sort y por order, tenemos q convertirlos a string para que se puedan usar en la consulta.
        if (sort) {
            options.order = [[sort as string, order as string]];
        }

        // Tenemos q mandar las page para filtrar, pero la bd solo permite tipo number asique casteamos
        if (perPage && page) {
            options.offset = (Number(page) - 1) * Number(perPage);
            options.limit = perPage;
        }
        // Tomamos la cantidad de la consulta para enviar el paginado al front
        const total = await db.Product.count({where: options.where});
        let products = await db.Product.findAll(options);
        // Añadimos la info para el paginado al header del response


        response.set("X-Total-Count", total);
        response.set("Access-Control-Expose-Headers", "X-Total-Count");
        if (id) {
            return response.status(200).json(products[0]);
        }

        return response.status(200).json(products);
    } catch (error: any) {
        return response.status(500).json({error: error.message});
    }
};


export const UPDATE_UpdateProduct = async (
    request: Request,
    response: Response
) => {
    try {
        let product:TypeProduct = request.body;
        if (product.image.length > 100) {
            const uploadRes = await cloudinary.uploader.upload(product.image, {
                upload_preset: 'unbardo'
            })
            product.image = uploadRes.url
        }
        const [numberOfAffectedRows, affectedRows] = await db.Product.update({
            ...product
        }, {
            where: {id: product.id},
            returning: true
        });
        if (numberOfAffectedRows === 0) {
            throw new Error(`No product updated with id ${product.id}`);
        }
        return response.status(200).json(affectedRows[0]);


        //TODO: STATUS => 201: Created, 204: No Content
    } catch (error) {
        return response.status(400).json(getErrorMessage(error)) //TODO: STATUS => 400: Bad Request
    }
}
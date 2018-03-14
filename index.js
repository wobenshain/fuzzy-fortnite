const express = require('express'),
      bodyParser = require('body-parser'),
      sqlite = require('sqlite3').Database,
      transactdb = require("sqlite3-transactions").TransactionDatabase,
      after = require('after'),
      xssfilter = require('secure-filters');
var app = express();

app.use(bodyParser.json({extended:true}));

app.use(express.static('web'));

app.get('/categories', function(req, res, next) {
    runSerialQuery(res,next,[{
        sql: `
                SELECT cat.rowid, cat.name, cat.parent, COUNT(wdg.rowid) AS count
                FROM category cat
                    LEFT OUTER JOIN widget wdg ON wdg.category_id = cat.rowid
                GROUP BY cat.rowid, cat.name
                ORDER BY parent;
            `,
        callback: (rows)=>{
            var categories = {
                "": {
                    name: "",
                    children: [],
                    count: 0
                }
            };
            rows.forEach((row) => {
                var parentId = row.parent==null?'':row.parent,
                    category = categories[row.rowid] = categories[row.rowid]||{children:[]},
                    parent = categories[parentId] = categories[parentId]||{children:[]};
                category.parent = parentId;
                category.name = row.name;
                category.count = row.count;
                parent.children.push(row.rowid);
            });
            // recursive helper function to get count of all descendents
            var sumUp = function(self) {
                if (self.children.length > 0) {
                    self.count += self.children.map((child)=> sumUp(categories[child])).reduce((prev,curr)=>prev+curr);
                }
                return self.count;
            }
            sumUp(categories['']);
            return {categories: categories};
        }
    }]);
});

app.post('/categories', function(req, res, next) {
    var params = req.body.parameters,
        parentId = params['category-parent']||'',
        name = params['category-name'];
    if (parentId !== '') parentId = parseInt(params['category-parent']);
    if (isNaN(parentId)) return next("Selected Category was invalid.");
    var queries = [];
    if (parentId!=='') {
        queries.push({
            sql: `SELECT COUNT(*) as cat FROM category`+(parentId!==''?` WHERE rowid = ?`:``),
            params: (parentId!==''?[parentId]:[]),
            callback: (rows) => {
                if (rows.length < 1 || rows[0].cat < 1) return next("Parent category does not exist.");
            }
        });
    }
    queries.push({
        sql: `INSERT INTO category VALUES (?,?)`,
        params: [name,parentId],
        callback: () => {
            res.send({parameters:{}});
        }
    });
    runSerialQuery(res,next,queries);
});

app.get('/facets', function(req, res, next) {
    runSerialQuery(res,next,[{
        sql: `
                SELECT type.rowid AS type_id, type.name AS type_name, value.rowid AS value_id, value.name AS value_name
                FROM attribute_type type
                    LEFT OUTER JOIN attribute_value value ON value.type_id = type.rowid
                ORDER BY type_name, value.'order'
            `,
        callback: (rows) => {
            var facets = {};
            rows.forEach((row) => {
                facets[row.type_name] = facets[row.type_name]||{id:row.type_id,values:[]};
                facets[row.type_name].values.push({id:row.value_id,value:row.value_name});
            });
            return {facets: facets};
        }
    }]);
});

function getOrder(orderNumber, res, next) {
    runSerialQuery(res,next,[{
        sql: `
            SELECT wdg.rowid,
                cat.name AS widget_name,
                wdg.inventory+ord.count AS inventory,
                ord.count AS 'order',
                type.name AS type_name,
                value.name AS value_name
            FROM 'order' ord
                JOIN widget wdg ON wdg.rowid = ord.widget_id
                JOIN category cat ON wdg.category_id = cat.rowid
                LEFT OUTER JOIN widget_attribute wa ON wdg.rowid = wa.widget_id
                LEFT OUTER JOIN attribute_value value ON wa.attribute_value_id = value.rowid
                LEFT OUTER JOIN attribute_type type ON value.type_id = type.rowid
            WHERE ord.order_id = ?
            ORDER BY ord.rowid, type.name, value.name
        `,
        params: [orderNumber],
        callback: (rows) => {
            if (rows.length < 1) return next("This order could not be found.");
            var lastrow = null,
                products = [];;
            rows.forEach((row) => {
                if (row.rowid != lastrow) {
                    lastrow = row.rowid;
                    products.push({
                        id: row.rowid,
                        name: row.widget_name,
                        inventory: row.inventory,
                        order: row.order,
                        attributes: {}
                    });
                }
                if (row.type_name != null && row.value_name != null) {
                    products[products.length-1].attributes[row.type_name] = row.value_name;
                }
            });
            return {orderNumber: orderNumber, orderInventory: products, inventoryChange: [], showPanel: true};
        }
    }]);
}

app.get('/orders/:id', function(req, res, next) {
    var orderNumber = req.params.id;
    getOrder(orderNumber, res, next);
});

app.post('/orders', function(req, res, next) {
    // Merge changes from matching ids to prevent data errors
    var changes = req.body.change,
        changeMap = {};    
    changes.forEach((change) => {
        changeMap[change.id] = changeMap[change.id]||0;
        changeMap[change.id] += change.value;
    });
    changes = [];
    for (let id in changeMap) {
        changes.push({id: id, value: changeMap[id]});
    }
    // done merging

    if (changes.filter((change) => { return change.value < 1; }).length > 0) return next("Cannot create a new order with non-positive entries.");

    var returnValue = { orderNumber: null, orderInventory: [], inventoryChange: [], showPanel: true };

    var db = new transactdb(new sqlite('widgets.db',(err) => { if (err) return next(err); }));
    db.serialize(() => {
        db.beginTransaction((err,transaction) => {
            // only respond to server once we've completed all queries
            var finalResponse = after(changes.length+1,() => {
                    transaction.commit((err) =>{
                        if (err) {
                            return next(err);
                        }
                    });
                    res.send(returnValue);
                }),
                respond = (err) => { if (err) return next(err); finalResponse(); };
            // update inventory
            // needs to be an atomic transaction to ensure accurate values
            transaction.all(
                `
                    SELECT wdg.rowid,
                        cat.name AS widget_name,
                        wdg.inventory,
                        type.name AS type_name,
                        value.name AS value_name
                    FROM widget wdg
                        JOIN category cat ON wdg.category_id = cat.rowid
                        LEFT OUTER JOIN widget_attribute wa ON wdg.rowid = wa.widget_id
                        LEFT OUTER JOIN attribute_value value ON wa.attribute_value_id = value.rowid
                        LEFT OUTER JOIN attribute_type type ON value.type_id = type.rowid
                    WHERE wdg.rowid IN (`+Array(changes.length).fill('?').join(',')+`)
                    ORDER BY wdg.rowid
                `,
                changes.map((change) => { return change.id }),
                (err,rows) => {
                    if (err) {
                        return next(err);
                    }
                    var lastrow = null,
                        order = [],
                        changeCount = 0;
                    for (let index = 0; index < rows.length; index++) {
                        var row = rows[index];
                        if (row.rowid != lastrow) {
                            lastrow = row.rowid;
                            var changeValue = changes.filter((change) => { return change.id == lastrow; })[0].value;
                            var inventory = row.inventory-changeValue;
                            if (inventory < 0) {
                                // We don't need to worry about checking if we have enough to fulfill the order
                                // because this error will cause a rollback of the previous insert
                                db._exec('ROLLBACK');
                                return next("There are not enough of this widget left to make this change.");
                            }
                            order.push({
                                id: lastrow,
                                name: row.widget_name,
                                inventory: inventory,
                                order: changeValue,
                                attributes: {}
                            });
                            changeCount++;
                            transaction.all(
                                `UPDATE widget SET inventory = ? WHERE rowid = ?`,
                                [inventory,lastrow],
                                respond
                            );
                        }
                        if (row.type_name != null && row.value_name != null) {
                            order[order.length-1].attributes[row.type_name] = row.value_name;
                        }
                    }
                    if (changeCount < changes.length) {
                        db._exec('ROLLBACK');
                        return next("One of the widgets doesn't exist in the database.");
                    }
                    returnValue.orderInventory = order;
                }
            );
            // create the order second to avoid unnecessary writes/rollbacks due to unfulfillable request
            transaction.all(
                `SELECT IFNULL(MAX(rowid),0)+1 AS orderNumber FROM 'order'`,
                (err, rows) => {
                    if (err) {
                        return next(err);
                    }
                    var orderNumber = rows[0].orderNumber.toLocaleString('en', {minimumIntegerDigits:8,useGrouping:false})
                    returnValue.orderNumber = orderNumber;
                    transaction.all(
                        `INSERT INTO 'order' VALUES `+Array(changes.length).fill(`(?1,?,?)`).join(`,`),
                        // flatten changes as array and prepend orderNumber
                        Array.prototype.concat.apply([orderNumber],changes.map((change) => { return [change.id, change.value]; })),
                        respond
                    );
                }
            );
        });
    });
    db.close((err) => {
        if (err) {
            return next(err);
        }
    });
});

app.put('/orders/:id', function(req, res, next) {
    var id = req.params.id,
        changes = req.body.change;
    changeMap = {}
    changes.forEach((change) => {
        changeMap[change.id] = changeMap[change.id]||0;
        changeMap[change.id] += change.value;
    });
    changes = [];
    for (let id in changeMap) {
        changes.push({id: id, value: changeMap[id]});
    }
    var db = new transactdb(new sqlite('widgets.db',(err) => { if (err) return next(err); }));
    db.serialize(() => {
        db.beginTransaction((err,transaction) => {
            // only respond to server once we've completed all queries
            var finalResponse = after(changes.length*2,() => {
                    transaction.commit((err) =>{
                        if (err) {
                            return next(err);
                        }
                    });
                    getOrder(id,res,next);
                }),
                respond = (err) => { if (err) return next(err); finalResponse(); };
            // update inventory
            // needs to be an atomic transaction to ensure accurate values
            transaction.all(
                `
                    SELECT wdg.rowid AS widget_id, ord.rowid AS order_rowid, IFNULL(ord.count,0) AS count, wdg.inventory
                    FROM widget wdg
                        LEFT OUTER JOIN 'order' ord ON ord.widget_id = wdg.rowid AND ord.order_id = ?
                    WHERE wdg.rowid IN (`+Array(changes.length).fill("?").join(",")+`)
                `,
                [id].concat(changes.map((change) => { return change.id })),
                (err,rows) => {
                    if (err) {
                        return next(err);
                    }
                    for (let index = 0; index < rows.length; index++) {
                        var row = rows[index];
                        var change = changes.filter((change) => { return change.id == row.widget_id; })[0];
                        if (row.count + change.value < 0) {
                            db._exec('ROLLBACK');
                            return next("You cannot remove more from your order than in is in it.");
                        }
                        if (row.inventory - change.value < 0) {
                            db._exec('ROLLBACK');
                            return next("You cannot add more to your order than is available.");
                        }
                        transaction.all(
                            `UPDATE widget SET inventory = ? WHERE rowid = ?`,
                            [row.inventory - change.value, row.widget_id],
                            respond
                        );
                        if (row.order_rowid) {
                            if (row.count + change.value == 0) {
                                transaction.all(
                                    `DELETE FROM 'order' WHERE rowid = ?`,
                                    [row.order_rowid],
                                    respond
                                );
                            } else {
                                transaction.all(
                                    `UPDATE 'order' SET count = ? WHERE rowid = ?`,
                                    [row.count + change.value, row.order_rowid],
                                    respond
                                );
                            }
                        } else {
                            transaction.all(
                                `INSERT INTO 'order' VALUES (?,?,?)`,
                                [id, row.widget_id, change.value],
                                respond
                            )
                        }
                    }
                }
            );
        });
    });
    db.close((err) => {
        if (err) {
            return next(err);
        }
    });
});

app.delete('/orders/:id', function(req, res, next) {
    var id = req.params.id;
    var db = new transactdb(new sqlite('widgets.db',(err) => { if (err) return next(err); }));
    db.serialize(() => {
        db.beginTransaction((err,transaction) => {
            // update inventory
            // needs to be an atomic transaction to ensure accurate values
            transaction.all(
                `
                    SELECT
                        ord.widget_id,
                        ord.count+wdg.inventory AS inventory
                    FROM 'order' ord
                        JOIN widget wdg ON wdg.rowid = ord.widget_id
                    WHERE order_id = ?
                `,
                [id],
                (err, rows) => {
                    if (err) {
                        return next(err)
                    };
                    // only respond to server once we've completed all queries
                    var finalResponse = after(rows.length,() => {
                            transaction.commit((err) =>{
                                if (err) {
                                    return next(err);
                                }
                            });
                            res.send({ orderNumber: null, orderInventory: [], inventoryChange: [], showPanel: false });
                        }),
                        respond = (err) => { if (err) return next(err); finalResponse(); };
                    rows.forEach((row) => {
                        transaction.all(
                            `UPDATE widget SET inventory = ? WHERE rowid = ?`,
                            [row.inventory, row.widget_id],
                            respond
                        );
                    });
                }
            );
            transaction.all(
                `DELETE FROM 'order' WHERE order_id = ?`,
                [id]
            );
        });
    });
});

app.get('/products',function(req, res, next) {
    var categories = req.query.selectedCategory,
        facets = req.query.selectedFacets,
        offset = parseInt(req.query.offset||1),
        subquery = ``,
        params = [],
        where = ``;
    // complex query building to avoid callbacks
    subquery = `
        FROM widget wdg
            JOIN category cat ON wdg.category_id = cat.rowid
            LEFT OUTER JOIN widget_attribute wa ON wdg.rowid = wa.widget_id
            LEFT OUTER JOIN attribute_value value ON wa.attribute_value_id = value.rowid
            LEFT OUTER JOIN attribute_type type ON value.type_id = type.rowid
        `;
    // Select Categories
    if (categories && categories.length > 0) {
        where += ` AND cat.rowid IN (`+Array(categories.length).fill('?').join(",")+`)`;
        params = params.concat(categories);
    }
    // Select Facets
    if (facets && facets.length > 0) {
        var whereFac = ``,
            paramsFac = [];
        for (let index in facets) {
            var facet = facets[index]
            whereFac += ` INTERSECT
                SELECT
                    widget_id
                FROM widget_attribute
                WHERE attribute_value_id IN (`+Array(facet.length).fill('?').join(',')+`)`,
            paramsFac = paramsFac.concat(facet);
        }
        where += ` AND wdg.rowid IN (`+whereFac.substring(11)+`)`;
        params = query.params.concat(paramsFac);
    }
    subquery += (where.length > 0 ? `WHERE `+where.substring(5) : ``)
    runSerialQuery(res,next,[{
        sql: `
                SELECT COUNT(DISTINCT wdg.rowid) AS count
            `+subquery,
        params: params,
        callback: (rows) => {
            if (rows.length < 1) {
                return next("Something weird happened");
            }
            return {count: rows[0].count };
        }
    },{
        sql: `
                SELECT wdg.rowid,
                    cat.name AS widget_name,
                    wdg.inventory,
                    type.name AS type_name,
                    value.name AS value_name
                FROM widget wdg
                    JOIN category cat ON wdg.category_id = cat.rowid
                    LEFT OUTER JOIN widget_attribute wa ON wdg.rowid = wa.widget_id
                    LEFT OUTER JOIN attribute_value value ON wa.attribute_value_id = value.rowid
                    LEFT OUTER JOIN attribute_type type ON value.type_id = type.rowid
                WHERE wdg.rowid IN (
                    SELECT DISTINCT wdg.rowid
            `+subquery+`
                    ORDER BY wdg.inventory DESC
                    LIMIT 10 OFFSET ?)
                Order BY wdg.inventory DESC
            `,
        params: params.concat([offset*10-10]),
        callback: (rows, returnValue) => {
            var lastrow = null,
                products = [];
            rows.forEach((row) => {
                if (row.rowid != lastrow) {
                    lastrow = row.rowid;
                    products.push({
                        id: row.rowid,
                        name: row.widget_name,
                        inventory: row.inventory,
                        attributes: {}
                    });
                }
                if (row.type_name != null && row.value_name != null) {
                    products[products.length-1].attributes[row.type_name] = row.value_name;
                }
            });
            returnValue.products = products;
            return returnValue;
        }
    }]);
});

app.get('/widgets',function(req, res, next) {
    var category = req.query.category,
        facets = req.query.facets||[],
        sql = `SELECT rowid AS id, inventory FROM widget WHERE category_id = ?`,
        params = [category];
    if (facets.length > 0) {
        // Get all widgets that contain other facets, then get all the widgets that are not those widgets and interesect them with the faceted widgets to product an exact match
        sql += ` AND rowid IN (`+Array(facets.length).fill(`SELECT widget_id FROM widget_attribute WHERE attribute_value_id = ?`).join(` INTERSECT `)+
            ` INTERSECT SELECT rowid AS widget_id FROM widget WHERE widget_id NOT IN (SELECT DISTINCT widget_id FROM widget_attribute WHERE attribute_value_id NOT IN (`+Array(facets.length).fill('?').join(',')+`)))`;
        params = params.concat(facets).concat(facets);
    } else {
        sql += ` AND rowid NOT IN (SELECT DISTINCT widget_id FROM widget_attribute)`
    }
    runSerialQuery(res,next,[{
        sql: sql,
        params: params,
        callback: (rows) => {
            return rows[0]||{ id: null, inventory: 0 };
        }
    }]);
});

app.put('/widgets/:id',function(req, res, next) {
    var id = req.params.id,
        inventory = parseInt(req.body.inventory);
    runSerialQuery(res,next,[{
        sql: `UPDATE widget SET inventory = ? WHERE rowid = ?`,
        params: [inventory,id],
        callback: () => {
            return {id: null, inventory: null, parameters: {}};
        }
    }]);
});

app.post('/widgets',function(req, res, next) {
    var inventory = parseInt(req.body.inventory),
        category = req.body.category,
        facets = req.body.facets,
        query = `SELECT rowid AS id, inventory FROM widget WHERE category_id = ?`,
        params = [category];
    if (inventory < 1) return next("You cannot create a widget with no inventory.");
    if (facets.length > 0) {
        // Get all widgets that contain other facets, then get all the widgets that are not those widgets and interesect them with the faceted widgets to product an exact match
        query += ` AND rowid IN (`+Array(facets.length).fill(`SELECT widget_id FROM widget_attribute WHERE attribute_value_id = ?`).join(` INTERSECT `)+
            ` INTERSECT SELECT rowid AS widget_id FROM widget WHERE widget_id NOT IN (SELECT DISTINCT widget_id FROM widget_attribute WHERE attribute_value_id NOT IN (`+Array(facets.length).fill('?').join(',')+`)))`;
        params = params.concat(facets).concat(facets);
    } else {
        query += ` AND rowid NOT IN (SELECT DISTINCT widget_id FROM widget_attribute)`
    }
    var db = new transactdb(new sqlite('widgets.db',(err) => { if (err) return next(err); }));
    db.serialize(() => {
        db.beginTransaction((err,transaction) => {
            // update inventory
            // needs to be an atomic transaction to ensure accurate values
            transaction.all(
                query,
                params,
                (err, rows) => {
                    if (err) {
                        return next(err);
                    }
                    if (rows.length > 0) next("This widget already exists!");
                }
            );
            transaction.all(
                `SELECT rowid FROM attribute_value WHERE rowid IN (`+Array(facets.length).fill('?').join(',')+`)`,
                facets,
                (err, rows) => {
                    if (err) {
                        return next(err);
                    }
                    if (rows.length != facets.length) {
                        db._exec('ROLLBACK');
                        return next("Some of these options don't exist so we can't really create this.");
                    }
                }
            );
            transaction.all(
                `INSERT INTO widget VALUES (?,?)`,
                [category,inventory]
            );
            transaction.all(
                `SELECT last_insert_rowid() AS id`,
                [],
                (err, rows) => {
                    if (err) {
                        return next(err);
                    }
                    var id = rows[0].id;
                    transaction.all(
                        `INSERT INTO widget_attribute VALUES `+Array(facets.length).fill(`(?1,?)`).join(','),
                        [id].concat(facets),
                        (err) => {
                            transaction.commit((err) =>{
                                if (err) {
                                    return next(err);
                                }
                            });
                            res.send({ id: null, inventory: null });
                        }
                    );
                }
            );
        });
    });
});

function runSerialQuery(res,next,queries) {
    var db = new transactdb(new sqlite('widgets.db',(err) => {
            if (err) {
                return next(err);
            }
        }));
    db.serialize(() => {
        var returnValue,
            callbackCurrent = 0;
        db.beginTransaction((err,transaction) => {
            var respond = after(queries.length,() => {
                if (returnValue) {
                    res.send(returnValue);
                }
                transaction.commit((err) =>{
                    if (err) {
                        return next(err);
                    }
                });
            });
            for (let index in queries) {
                var query = queries[index];
                transaction.all(query.sql,query.params,(err, rows) => {
                    if (err) {
                        return next(err);
                    }
                    returnValue = queries[callbackCurrent++].callback(rows,returnValue);
                    respond();
                });
            }
        });
    });
    db.close((err) => {
        if (err) {
            return next(err);
        }
    });
}

app.use((err,req,res,next) => {
  if (err instanceof Error) return next(err);
  res.status(500).send({error: err});
});

app.listen(80);

let sync = Backbone.sync
Backbone.sync = function() {
    return sync.apply(this,arguments).fail(function(resp) {
        var resp = resp.responseJSON;
        console.log(resp);
        new app.BootstrapDialogView({
            model: new app.BootstrapDialogModel({
                message: resp.error,
                title: "Error"
            })
        });
    });
}

app.TemplatesModel = Backbone.Model.extend({
    defaults: {},
    fetch: function() {
        var $that = this,
            templateList = ["main","account","nav","categories","facets","products"],
            templateObject = {},
            deferred = $.Deferred(),
            after = _.after(templateList.length,function() {
                $that.set(templateObject);
                deferred.resolve();
            });
        _.each(templateList,function(templateName) {
            $.get('templates/'+templateName+'.html').done(function(response) {
                templateObject[templateName] = response;
                after();
            });
        });
        return deferred;
    }
});

app.MainModel = Backbone.Model.extend({
    defaults: {
    }
});

app.AccountModel = Backbone.Model.extend({
    defaults: {
        productModel: {},
        showPanel: false,
        orderNumber: null,
        orderInventory: [],
        inventoryChange: []
    },
    idAttribute: 'orderNumber',
    urlRoot: '/orders',
    parse: function(resp) {
        console.log(resp);
        return resp;
    },
    toJSON: function() {
        return {
            orderNumber: this.get('orderNumber'),
            inventory: this.get('orderInventory'),
            change: this.get('inventoryChange')
        };
    }
});

app.NavModel = Backbone.Model.extend({
    defaults: {
        productModel: {}
    }
});

app.CategoriesModel = Backbone.Model.extend({
    defaults: {
        productModel: {},
        categories: [],
        selectedCategory: ''
    },
    url: '/categories',
    parse: function(resp) {
        console.log(resp);
        return resp;
    }
});

app.FacetsModel = Backbone.Model.extend({
    defaults: {
        productModel: {},
        facets: [],
        selectedFacets: {}
    },
    url: '/facets',
    parse: function(resp) {
        console.log(resp);
        return resp;
    }
});

app.ProductModel = Backbone.Model.extend({
    defaults: {
        accountModel: {},
        products: [],
        selectedCategory: [],
        selectedFacets: [],
        offset: 1
    },
    url: '/products',
    parse: function(resp) {
        resp = $.extend({},this.attributes,resp);
        console.log(resp);
        return resp;
    },
    toJSON: function() {
        return {
            selectedCategory: this.get('selectedCategory'),
            selectedFacets: this.get('selectedFacets'),
            offset: this.get('offset')
        };
    }
});

app.BootstrapDialogModel = Backbone.Model.extend({
    defaults: {
        message: "",
        title: ""
    }
});

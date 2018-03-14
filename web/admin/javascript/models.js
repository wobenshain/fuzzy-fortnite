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
            templateList = ["main","nav","admin","add-widget","add-category"],
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

app.NavModel = Backbone.Model.extend({
    defaults: {
    }
});

app.AdminModel = Backbone.Model.extend({
    defaults: {
    }
});

app.AddWidgetModel = Backbone.Model.extend({
    defaults: {
        id: null,
        inventory: null,
        categoriesModel: {},
        facetsModel: {},
        categories: [],
        facets: [],
        parameters: {}
    },
    urlRoot: '/widgets',
    parse: function(resp) {
        console.log(resp);
        return resp;
    },
    toJSON: function() {
        var facets = $.extend({},this.get('parameters'));
        delete facets['widget-category'];
        facets = Object.values(facets).filter((facet) => { return facet != ''; });
        return {
            id: this.get('id'),
            inventory: this.get('inventory'),
            category: this.get('parameters')['widget-category'],
            facets: facets
        };
    }
});

app.CategoriesModel = Backbone.Model.extend({
    defaults: {
        parameters: {},
        productModel: {},
        categories: {'':{children:[]}},
        selectedCategory: null
    },
    url: '/categories',
    parse: function(resp) {
        console.log(resp);
        return resp;
    },
    toJSON: function() {
        return {
            parameters: this.get('parameters')
        }
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

app.BootstrapDialogModel = Backbone.Model.extend({
    defaults: {
        message: "",
        title: ""
    }
});

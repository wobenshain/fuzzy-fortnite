app.MainView = Backbone.View.extend({
    el: 'body',
    initialize: function() {
        this.template = _.template(app.templates.get('main'));
        this.model.on({
            'change:selectedCategory': this.propagateCategories,
            'change:selectedFacets': this.propagateFacets
        }, this);
        this.render.apply(this);
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
        // Model Setup
        app.models.account = new app.AccountModel();
        app.models.product = new app.ProductModel({
            accountModel: app.models.account
        });
        app.models.account.set('productModel',app.models.product);
        app.models.nav = new app.NavModel({
            productModel: app.models.product
        });
        // View Setup
        app.views.account = new app.AccountView({
            model: app.models.account
        });
        app.views.product = new app.ProductView({
            model: app.models.product
        });
        app.views.nav = new app.NavView({
            model: app.models.nav
        });
    }
});

app.AccountView = Backbone.View.extend({
    el: '#widget-account',
    initialize: function() {
        this.template = _.template(app.templates.get('account'));
        this.model.on({
            'change:inventoryChange': this.inventoryChange,
            'change:orderInventory': this.render
        }, this);
        this.render.apply(this);
    },
    events: {
        'keyup [name="widget-order-number"]': 'enableFetch',
        'click a.notification': 'showPanel',
        'click button.fetch': 'getOrder',
        'click button.update': 'updateOrder',
        'click button.delete': 'deleteOrder',
        'click a.delete': 'deleteEntry'
    },
    deleteEntry: function(e) {
        var id = $(e.target).closest('.product').data('id'),
            orderInventory = this.model.get('orderInventory'),
            entry = orderInventory.filter((widget) => { return widget.id == id; })[0];
        this.model.set('inventoryChange',[{id:id,value:0-entry.order}]);
    },
    deleteOrder: function(e) {        
        this.model.destroy().done((resp) => {
            this.model.set(resp);
            this.model.get('productModel').set('update', true);
        });
        return false;
    },
    getOrder: function(e) {
        var $that = this;
        this.model.set('orderNumber',this.$el.find('[name="widget-order-number"]').val());
        this.model.fetch().fail(() => {
            $that.model.set({
                orderNumber: null,
                orderInventory: []
            });
            $that.model.trigger('change:orderInventory');
        });
    },
    updateOrder: function(e) {
        var orderInventory = this.model.get('orderInventory'),
            inventoryChange = [];
        orderInventory.forEach((widget) => {
            inventoryChange.push({
                id: widget.id,
                value: parseInt(this.$el.find('[data-id="'+widget.id+'"] .inventory-dropdown').val())-widget.order
            });
        });
        this.model.set('inventoryChange',inventoryChange);
    },
    showPanel: function(e) {
        this.$el.find('#widget-account-panel').toggleClass('show');
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
    },
    enableFetch: function() {
        this.$el.find('button.fetch').prop('disabled',this.$el.find('[name="widget-order-number"]').val() == "");
    },
    inventoryChange: function() {
        if (this.model.get('inventoryChange').filter((entry) => { return entry.value != 0; }).length > 0) {
            var $that = this;
            this.model.save().fail(() => {
                $that.model.trigger('change:orderInventory');
            }).always(() => {
                this.model.get('productModel').set('update', true);
            });
        }
    }
});

app.NavView = Backbone.View.extend({
    el: '#widget-nav',
    initialize: function() {
        this.template = _.template(app.templates.get('nav'));
        this.model.on({
            'change:selectedCategory': this.propagateCategories,
            'change:selectedFacets': this.propagateFacets
        }, this);
        this.render.apply(this);
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
        app.models.categories = new app.CategoriesModel({
            productModel: this.model.get('productModel')
        });
        app.views.categories = new app.CategoriesView({
            model: app.models.categories
        });
        app.models.facets = new app.FacetsModel({
            productModel: this.model.get('productModel')
        });
        app.views.facets = new app.FacetsView({
            model: app.models.facets
        });
    }
});

app.CategoriesView = Backbone.View.extend({
    el: '#widget-categories',
    initialize: function() {
        var $that = this;
        this.template = _.template(app.templates.get('categories'));
        this.model.on({
            'change:selectedCategory': this.propagateCategories
        }, this);
        this.model.fetch().done(function() {
            $that.render.apply($that);
        });
    },
    events: {
        'click a': 'drilldown'
    },
    drilldown: function(e) {
        var id = $(e.target).data('id');
        this.model.set('selectedCategory',id);
        return false;
    },
    propagateCategories: function() {
        var categories = this.model.get('categories'),
            subcategories = function(id) {
                return [id].concat(categories[id].children.map((child) => subcategories(child)).reduce((a,b) => a.concat(b),[]));
            },
            selectedCategory = this.model.get('selectedCategory'),
            passalong = selectedCategory==''?null:subcategories(selectedCategory);
        this.model.get('productModel').set('selectedCategory',passalong);
        this.render.apply(this);
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
    }
});

app.FacetsView = Backbone.View.extend({
    el: '#widget-facets',
    initialize: function() {
        var $that = this;
        this.template = _.template(app.templates.get('facets'));
        this.model.on({
            'change:selectedFacets': this.propagateFacets
        }, this);
        this.model.fetch().done(function() {
            $that.render.apply($that);
        });
    },
    events: {
        'click a': 'drilldown',
        'click input[type="checkbox"]': 'selectFacet'
    },
    propagateFacets: function() {
        var selectedFacets = this.model.get('selectedFacets'),
            facets = [];
        for (var type in selectedFacets) {
            var values = [];
            for (var value in selectedFacets[type]) {
                values.push(value);
            }
            facets.push(values);
        }
        this.model.get('productModel').set('selectedFacets',facets);
    },
    drilldown: function(e) {
        $(e.target).closest('li').children('.collapse').toggleClass('show');
    },
    selectFacet: function(e) {
        var target = $(e.target),
            type = target.closest('ul').data('id'),
            value = target.data('id'),
            selectedFacets = this.model.get('selectedFacets');
        if (target.prop('checked')) {
            selectedFacets[type] = selectedFacets[type]||{};
            selectedFacets[type][value] = true;
        } else if (selectedFacets[type]) {
            if (selectedFacets[type][value]) {
                delete selectedFacets[type][value];
            }
            if (Object.keys(selectedFacets[type]).length < 1) {
                delete selectedFacets[type];
            }
        }
        this.model.set('selectedFacets',selectedFacets);
        this.model.trigger('change:selectedFacets');
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
    }
});

app.ProductView = Backbone.View.extend({
    el: '#widget-product',
    initialize: function() {
        this.template = _.template(app.templates.get('products'));
        this.model.on({
            'change:selectedCategory': this.update,
            'change:selectedFacets': this.update,
            'change:products': this.render,
            'change:update': this.update,
            'change:offset': this.update
        }, this);
        this.update.apply(this);
    },
    events: {
        'click button': 'addToOrder',
        'change select[name="offset"]': app.events.updateModel
    },
    addToOrder: function(e) {
        var target = $(e.target),
            group = target.closest('.product'),
            select = group.find('select'),
            inventory = group.find('.inventory'),
            val = parseInt(select.val()),
            id = group.data('id');
        this.model.get('accountModel').set('inventoryChange',[{id:id,value:val}]);
    },
    render: function() {
        this.$el.html(this.template($.extend({template: this.productTemplate},this.model.attributes)));
    },
    update: function() {
        this.model.set('update',false,{silent: true});
        var $that = this,
            data = {
                selectedCategory: this.model.get('selectedCategory'),
                selectedFacets: this.model.get('selectedFacets'),
                offset: this.model.get('offset')
            };
        delete data.products;
        this.model.fetch({
            data: data
        }).done(function() {
            $that.render.apply($that);
        });
    }
});

app.BootstrapDialogView = Backbone.View.extend({
    initialize: function() {
        this.render();
    },
    events: {
        'hidden.bs.modal': 'remove',
        'click .modal-footer button:not(.create)': 'close'
    },
    close: function(e) {
        e.preventDefault();
        this.$modal.close();
    },
    render: function() {
        this.$modal = BootstrapDialog.show({
            buttons: [{
                'cssClass': 'btn-primary',
                'label': "Close"
            }],
            closable: true,
            message: this.model.get('message'),
            title: this.model.get('title')
        });
        this.setElement(this.$modal.getModal());
    }
});

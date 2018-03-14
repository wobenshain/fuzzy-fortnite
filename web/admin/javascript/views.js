app.MainView = Backbone.View.extend({
    el: 'body',
    initialize: function() {
        this.template = _.template(app.templates.get('main'));
        this.render.apply(this);
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
        // Model Setup
        app.models.categories = new app.CategoriesModel();
        app.models.facets = new app.FacetsModel();
        app.models.nav = new app.NavModel();
        app.models.admin = new app.AdminModel({
            categoriesModel: app.models.categories,
            facetsModel: app.models.facets
        });
        // View Setup
        app.views.nav = new app.NavView({
            model: app.models.nav
        });
        app.views.admin = new app.AdminView({
            model: app.models.admin
        });
    }
});

app.NavView = Backbone.View.extend({
    el: '#widget-nav',
    initialize: function() {
        this.template = _.template(app.templates.get('nav'));
        this.render.apply(this);
    },
    events: {
        'click a': 'togglePanel'
    },
    togglePanel: function(e) {
        $($(e.target).attr('href')).addClass('show').siblings().removeClass('show');
        return false;
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
    }
});

app.AdminView = Backbone.View.extend({
    el: '#widget-admin',
    initialize: function() {
        this.template = _.template(app.templates.get('admin'));
        this.render.apply(this);
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
        app.models.addWidget = new app.AddWidgetModel({
            categoriesModel: this.model.get('categoriesModel'),
            facetsModel: this.model.get('facetsModel')
        });
        app.views.addWidget = new app.AddWidgetView({
            model: app.models.addWidget
        });
        app.views.addCategory = new app.AddCategoryView({
            model: this.model.get('categoriesModel')
        });
    }
});

app.AddWidgetView = Backbone.View.extend({
    el: '#widget-add-widget',
    initialize: function() {
        var $that = this;
        this.template = _.template(app.templates.get('add-widget'));
        this.model.on({
            'change:parameters': this.enableFetch,
            'change:inventory': this.render
        }, this);
        var renderOn = _.after(2,() => {
            $that.render.apply($that);
        })
        this.model.get('categoriesModel').fetch().done(() => {
            $that.model.set('categories',$that.model.get('categoriesModel').get('categories'));
            renderOn();
        });
        this.model.get('facetsModel').fetch().done(() => {
            $that.model.set('facets',$that.model.get('facetsModel').get('facets'));
            renderOn();
        });
    },
    events: {
        'change select': 'updateModel',
        'click button.fetch': 'fetchWidget',
        'click button.cancel': 'cancelInventory',
        'click button.update': 'updateInventory'
    },
    updateModel: function(e) {
        this.model.get('parameters')[$(e.target).attr('name')] = $(e.target).val();
        this.model.trigger('change:parameters');
    },
    fetchWidget: function(e) {
        var parameters = $.extend({},this.model.get('parameters')),
            category = parameters['widget-category'];
        delete parameters['widget-category'];
        var data = {
            category: category,
            facets: Object.values(parameters).filter((facet) => { return facet != ''; })
        };
        this.model.fetch({
            data: data
        });
    },
    cancelInventory: function(e) {
        this.model.set({
            id: null,
            inventory: null
        });
    },
    updateInventory: function(e) {
        var inventory = parseInt(this.$el.find('[name="inventory"]').val());
        this.model.set('inventory',inventory);
        this.model.save();
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
    },
    enableFetch: function() {
        this.$el.find('button.fetch').prop('disabled',this.model.get('parameters')['widget-category']=="");
    }
});

app.AddCategoryView = Backbone.View.extend({
    el: '#widget-add-category',
    initialize: function() {
        this.template = _.template(app.templates.get('add-category'));
        this.model.on({
            'change:categories': this.render,
            'change:parameters': this.enableCreate
        }, this);
        this.render.apply(this);
    },
    events: {
        'keyup input': 'updateModel',
        'change select': 'updateModel',
        'click button.create': 'createCategory'
    },
    updateModel: function(e) {
        this.model.get('parameters')[$(e.target).attr('name')] = $(e.target).val();
        this.model.trigger('change:parameters');
    },
    createCategory: function(e) {
        var $that = this;
        this.model.save().done(() => {
            $that.model.fetch();
        });
    },
    render: function() {
        this.$el.html(this.template(this.model.attributes));
    },
    enableCreate: function() {
        this.$el.find('button.create').prop('disabled',this.model.get('parameters')['category-name']=="");
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

$(function() {
    app.templates = new app.TemplatesModel();
    app.templates.fetch().done(function() {
        app.models.main = new app.MainModel();
        app.views.main = new app.MainView({
            model: app.models.main
        });
    });
});

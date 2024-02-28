function changeLanguage(language) {
    if (language === 'en') {
        $('.translate').each(function() {
            $(this).text($(this).data('en'));
        });
    } else if (language === 'ru') {
        $('.translate').each(function() {
            $(this).text($(this).data('ru'));
        });
    }
}

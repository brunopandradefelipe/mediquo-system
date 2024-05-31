$(document).ready(function () {
    $('.btn-login').click(function (e) {
      e.preventDefault();
        let InputEmail = $('#InputEmail').val();
        let InputPassword = $('#InputPassword').val();

        if (InputEmail == "" || InputPassword == "") {
            $('.message-error').removeClass('d-none');
            $('.message-error').html(`Preencha todos os campos acima!`);
            $('#InputEmail').addClass('is-invalid');
            $('#InputPassword').addClass('is-invalid');
            return;
        }
        console.log(InputEmail, InputPassword);
        $.ajax({
            url: "/api/users/login",
            type: "POST",
            dataType: 'json',
            data: JSON.stringify({
              email: InputEmail,
              password: InputPassword
            }),
            contentType: 'application/json', // Defina o cabeçalho Content-Type como application/json
            success: function (result) {
              window.location.href = '/dashboard';
            },
            error: function (result) {
                console.log(result);
                $('.message-error').removeClass('d-none');
                $('.message-error').html(result.responseJSON.message);
                $('#InputEmail').addClass('is-invalid');
                $('#InputPassword').addClass('is-invalid');
            }
          });
    });
});
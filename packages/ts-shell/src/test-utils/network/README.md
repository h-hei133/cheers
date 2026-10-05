# Local TLS fixture

`cert.pem` and `key.pem` are a generated, public test fixture for `public.example`. They are not deployment credentials. The connection tests trust this certificate only in their mocked HTTPS request adapter; production trust settings are unchanged.

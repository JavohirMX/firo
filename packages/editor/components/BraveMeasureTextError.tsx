import Trans from "./Trans";

const BraveMeasureTextError = () => {
  return (
    <div data-testid="brave-measure-text-error">
      <p>
        <Trans
          i18nKey="errors.brave_measure_text_error.line1"
          bold={(el) => <span style={{ fontWeight: 600 }}>{el}</span>}
        />
      </p>
      <p>
        <Trans
          i18nKey="errors.brave_measure_text_error.line2"
          bold={(el) => <span style={{ fontWeight: 600 }}>{el}</span>}
        />
      </p>
      <p>
        <Trans
          i18nKey="errors.brave_measure_text_error.line3"
          link={(el) => (
            <a href="https://search.brave.com/help/how-to-disable-aggressive-block-fingerprinting/">
              {el}
            </a>
          )}
        />
      </p>

      {/*
        Upstream had a fourth line here: "open an issue on our GitHub, or write
        us on Discord". Firo has neither, so telling a user to file an issue
        where no issue tracker exists is worse than saying nothing. The advice
        that matters — disable aggressive fingerprinting — is above, and it
        links to Brave's own documentation.
      */}
    </div>
  );
};

export default BraveMeasureTextError;

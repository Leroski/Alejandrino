import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;

/** Run locally with Google's apksig JAR. Never place the key/password in Git or CI artifacts. */
public class SignBetaApk {
    public static void main(String[] args) throws Exception {
        if (args.length != 4) throw new IllegalArgumentException("input.apk output.apk private.p12 password-file");
        char[] password = Files.readString(Path.of(args[3])).trim().toCharArray();
        try {
            KeyStore store = KeyStore.getInstance("PKCS12");
            try (var input = Files.newInputStream(Path.of(args[2]))) { store.load(input, password); }
            PrivateKey key = (PrivateKey) store.getKey("alejandrino-beta", password);
            X509Certificate certificate = (X509Certificate) store.getCertificate("alejandrino-beta");
            var config = new ApkSigner.SignerConfig.Builder("alejandrino-beta", key, List.of(certificate)).build();
            File output = new File(args[1]);
            new ApkSigner.Builder(List.of(config)).setInputApk(new File(args[0])).setOutputApk(output)
                .setMinSdkVersion(29).setV1SigningEnabled(false).setV2SigningEnabled(true)
                .setV3SigningEnabled(true).setV4SigningEnabled(false).setOtherSignersSignaturesPreserved(false)
                .build().sign();
            var result = new ApkVerifier.Builder(output).setMinCheckedPlatformVersion(29).build().verify();
            if (!result.isVerified() || result.getSignerCertificates().size() != 1 ||
                !result.getSignerCertificates().get(0).equals(certificate)) throw new SecurityException("APK signature did not verify");
            String fingerprint = HexFormat.ofDelimiter(":").withUpperCase().formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
            System.out.println("Verified APK v2="+result.isVerifiedUsingV2Scheme()+" v3="+result.isVerifiedUsingV3Scheme());
            System.out.println("Certificate SHA-256: "+fingerprint);
        } finally { Arrays.fill(password, '\0'); }
    }
}

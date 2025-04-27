import React from "react";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { supabase } from "../supabaseClient";

const PAYEE_WALLET = "78BSNzBj8HkG7t9EH2pUu4vKjdjnRsjJDzUf6gyqfsXt";

export const PayForCredits = ({ onCreditsPurchase }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const handlePayment = async () => {
    if (!publicKey) {
      alert("Connect your wallet first!");
      return;
    }

    try {
      const latestBlockhash = await connection.getLatestBlockhash();

      const transaction = new Transaction({
        recentBlockhash: latestBlockhash.blockhash,
        feePayer: publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(PAYEE_WALLET),
          lamports: 1e6, // 0.001 SOL
        })
      );

      const signature = await sendTransaction(transaction, connection);
      console.log(`Transaction sent: ${signature}`);

      // Confirm transaction
      let retries = 10;
      let confirmed = false;

      while (retries > 0 && !confirmed) {
        const status = await connection.getSignatureStatus(signature);
        if (
          status &&
          status.value &&
          status.value.confirmationStatus === "confirmed"
        ) {
          confirmed = true;
          break;
        }
        retries--;
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
      }

      if (!confirmed) {
        throw new Error("Transaction confirmation failed.");
      }

      console.log("Transaction confirmed!");

      // Fetch current credits
      const walletAddress = publicKey.toBase58();
      const creditsToAdd = 10;

      const { data: user, error: fetchError } = await supabase
        .from("meme_gen")
        .select("credits")
        .eq("wallet_address", walletAddress)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        throw new Error(`Error fetching wallet: ${fetchError.message}`);
      }

      let newCredits = creditsToAdd;
      if (user) {
        newCredits += user.credits; // Add to existing credits
      }

      // Update credits in Supabase
      const { error: updateError } = await supabase
        .from("meme_gen")
        .upsert(
          { wallet_address: walletAddress, credits: newCredits },
          { onConflict: "wallet_address" }
        );

      if (updateError) {
        throw new Error(`Supabase error: ${updateError.message}`);
      }

      console.log("Credits updated in Supabase:", newCredits);

      // Update frontend credits
      onCreditsPurchase(creditsToAdd);
      alert("Payment successful! Credits added.");
    } catch (error) {
      console.error("Payment error:", error);
      alert("Payment failed! Check the console for details.");
    }
  };

  return (
    <button onClick={handlePayment} className="meme-button buy-credits">
      Buy Credits
    </button>
  );
};

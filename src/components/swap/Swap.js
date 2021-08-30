import { useAccount } from "../../data/account";
import { getRefReturn, useRefFinance } from "../../data/refFinance";
import React, { useEffect, useState } from "react";
import TokenSelect from "../token/TokenSelect";
import AvailableInput from "../common/AvailableInput";
import Big from "big.js";
import { useTokenBalances } from "../../data/tokenBalances";
import {
  bigMin,
  bigToString,
  computeUsdBalance,
  fromTokenBalance,
  toTokenBalance,
} from "../../data/utils";
import { useToken } from "../../data/token";
import "./Swap.scss";
import { NearConfig } from "../../data/near";
import Rate from "../common/Rate";
import TokenBalance from "../token/TokenBalance";
import TokenSymbol from "../token/TokenSymbol";
import { useHistory } from "react-router-dom";
import MutedDecimals from "../common/MutedDecimals";

const EditMode = {
  None: "None",
  Input: "Input",
  Output: "Output",
};

const findBestReturn = (
  refFinance,
  inTokenAccountId,
  outTokenAccountId,
  amountIn
) => {
  let swapInfo = {
    amountIn,
    amountOut: Big(0),
  };
  if (refFinance && !refFinance.loading) {
    // Computing path
    Object.values(refFinance.pools).forEach((pool) => {
      if (outTokenAccountId in pool.tokens && inTokenAccountId in pool.tokens) {
        const poolReturn =
          getRefReturn(pool, inTokenAccountId, amountIn) || Big(0);
        if (poolReturn.gt(swapInfo.amountOut)) {
          swapInfo = {
            amountIn,
            amountOut: poolReturn,
            pool,
          };
        }
      }
    });
  }
  return Object.assign(swapInfo, {
    inTokenAccountId,
    outTokenAccountId,
    expectedAmountOut: Big(0),
  });
};

const findBestInverseReturn = (
  refFinance,
  inTokenAccountId,
  outTokenAccountId,
  availableInToken,
  outAmount
) => {
  let left = Big(0);
  let right = availableInToken;
  let bestSwapInfo = null;
  for (let i = 0; i < 60; ++i) {
    const mid = left.add(right).div(2).round(0, 0);
    const { swapInfo, amountOut } = findBestReturn(
      refFinance,
      inTokenAccountId,
      outTokenAccountId,
      mid
    );
    if (amountOut.gt(outAmount)) {
      bestSwapInfo = swapInfo;
      right = mid;
    } else {
      left = mid;
    }
  }
  bestSwapInfo =
    bestSwapInfo ||
    findBestReturn(refFinance, inTokenAccountId, outTokenAccountId, right);
  bestSwapInfo.expectedAmountOut = outAmount;
  return bestSwapInfo;
};

const updateUrl = (history, inTokenAccountId, outTokenAccountId) => {
  history.replace(`/swap/${inTokenAccountId}/${outTokenAccountId}`);
};

export default function Swap(props) {
  const account = useAccount();
  const refFinance = useRefFinance();
  const history = useHistory();

  // const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(EditMode.None);

  const [inTokenAccountId, setInTokenAccountId] = useState(
    props.inputTokenId || NearConfig.wrapNearAccountId
  );
  const [inTokenAmountHuman, setInTokenAmountHuman] = useState(null);
  const inToken = useToken(inTokenAccountId);
  const { tokenBalances } = useTokenBalances(inTokenAccountId);

  const [availableInToken, setAvailableInToken] = useState(null);
  useEffect(() => {
    let availableInToken = Big(0);
    if (tokenBalances) {
      Object.entries(tokenBalances).forEach(([key, balance]) => {
        if (balance) {
          availableInToken = availableInToken.add(balance);
        }
      });
    }
    setAvailableInToken(availableInToken);
  }, [tokenBalances]);

  const availableInTokenHuman = fromTokenBalance(inToken, availableInToken);

  const [outTokenAccountId, setOutTokenAccountId] = useState(
    props.outputTokenId || NearConfig.skywardTokenAccountId
  );
  const outToken = useToken(outTokenAccountId);
  const [outTokenAmountHuman, setOutTokenAmountHuman] = useState(null);

  const [availableOutToken, setAvailableOutToken] = useState(Big(0));
  const [maxSwapInfo, setMaxSwapInfo] = useState(null);

  useEffect(() => {
    const swapInfo = findBestReturn(
      refFinance,
      inTokenAccountId,
      outTokenAccountId,
      availableInToken
    );
    setMaxSwapInfo(swapInfo);
    setAvailableOutToken(swapInfo.amountOut);
  }, [availableInToken, refFinance, inTokenAccountId, outTokenAccountId]);

  const availableOutTokenHuman = fromTokenBalance(outToken, availableOutToken);

  const [inTokenAmount, setInTokenAmount] = useState(null);
  const [outTokenAmount, setOutTokenAmount] = useState(null);
  const [swapInfo, setSwapInfo] = useState(null);

  useEffect(() => {
    if (editMode === EditMode.Input) {
      setInTokenAmount(
        bigMin(
          availableInToken,
          toTokenBalance(inToken, inTokenAmountHuman || Big(0))
        )
      );
    }
  }, [editMode, availableInToken, inToken, inTokenAmountHuman]);

  useEffect(() => {
    if (editMode === EditMode.Output) {
      setOutTokenAmount(
        bigMin(
          availableOutToken,
          toTokenBalance(outToken, outTokenAmountHuman || Big(0))
        )
      );
    }
  }, [editMode, availableOutToken, outToken, outTokenAmountHuman]);

  useEffect(() => {
    const needRecompute =
      swapInfo === null ||
      (editMode === EditMode.Input &&
        !swapInfo.amountIn.eq(inTokenAmount || Big(0))) ||
      (editMode === EditMode.Output &&
        !swapInfo.expectedAmountOut.eq(outTokenAmount || Big(0))) ||
      swapInfo.inTokenAccountId !== inTokenAccountId ||
      swapInfo.outTokenAccountId !== outTokenAccountId;
    if (editMode === EditMode.Input && inTokenAmount && needRecompute) {
      const swapInfo = findBestReturn(
        refFinance,
        inTokenAccountId,
        outTokenAccountId,
        inTokenAmount
      );
      setOutTokenAmount(swapInfo.amountOut);
      setSwapInfo(swapInfo);

      setOutTokenAmountHuman(
        fromTokenBalance(outToken, swapInfo.amountOut).round(6, 0)
      );
    } else if (
      editMode === EditMode.Output &&
      outTokenAmount &&
      needRecompute
    ) {
      const swapInfo = findBestInverseReturn(
        refFinance,
        inTokenAccountId,
        outTokenAccountId,
        availableInToken,
        outTokenAmount
      );
      setSwapInfo(swapInfo);
      setInTokenAmount(swapInfo.amountIn);

      setInTokenAmountHuman(
        fromTokenBalance(inToken, swapInfo.amountIn).round(6, 0)
      );
    }
  }, [
    editMode,
    swapInfo,
    refFinance,
    inTokenAccountId,
    inToken,
    inTokenAmount,
    inTokenAmountHuman,
    availableInToken,
    outTokenAccountId,
    outToken,
    outTokenAmount,
    outTokenAmountHuman,
  ]);

  const tokens = [
    ...new Set([
      ...Object.keys(
        Object.assign(
          {},
          account && !account.loading ? account.balances : {},
          refFinance ? refFinance.balances : {}
        )
      ),
      ...(refFinance ? refFinance.whitelistedTokens : []),
    ]),
  ].filter(
    (tokenId) =>
      tokenId === NearConfig.wrapNearAccountId ||
      (refFinance && tokenId in refFinance.prices)
  );

  const reverseDirection = (e) => {
    e.preventDefault();
    setInTokenAccountId(outTokenAccountId);
    setInTokenAmountHuman(outTokenAmountHuman);
    setInTokenAmount(outTokenAmount);
    setOutTokenAccountId(inTokenAccountId);
    setOutTokenAmountHuman(inTokenAmountHuman);
    setOutTokenAmount(inTokenAmount);
    if (editMode === EditMode.Input) {
      setEditMode(EditMode.Output);
    } else if (editMode === EditMode.Output) {
      setEditMode(EditMode.Input);
    }
    updateUrl(history, outTokenAccountId, inTokenAccountId);
  };

  let priceImpact = Big(0);
  let priceImpactDiff = Big(0);
  if (
    refFinance &&
    swapInfo &&
    swapInfo.pool &&
    maxSwapInfo &&
    maxSwapInfo.pool
  ) {
    const inputUsdValue = computeUsdBalance(
      refFinance,
      swapInfo.inTokenAccountId,
      swapInfo.amountIn
    );
    const outputUsdValue = computeUsdBalance(
      refFinance,
      swapInfo.outTokenAccountId,
      swapInfo.amountOut
    );

    priceImpact =
      inputUsdValue && inputUsdValue.gt(0)
        ? outputUsdValue.div(inputUsdValue).sub(1)
        : Big(0);

    priceImpactDiff = outputUsdValue.sub(inputUsdValue);
  }

  return (
    <div className="card mb-2 swap-card">
      <div className="card-body">
        <h2 className="primary-header">Swap</h2>
        <div className="mb-5">
          <div className="mb-3">
            <TokenSelect
              id="input-token-select"
              className="token-select"
              value={inTokenAccountId}
              tokens={[...tokens]}
              tokenFilter={(tokenAccountId) =>
                tokenAccountId !== outTokenAccountId
              }
              onSelectTokenId={(v) => {
                setMaxSwapInfo(null);
                setSwapInfo(null);
                updateUrl(history, v, outTokenAccountId);
                setInTokenAccountId(v);
              }}
            />

            <AvailableInput
              className="mt-1"
              large
              autoFocus
              value={inTokenAmountHuman}
              setValue={(v) => {
                setEditMode(EditMode.Input);
                setInTokenAmountHuman(v);
              }}
              limit={availableInTokenHuman}
              extraLabel={
                <span className="text-secondary">
                  {" ("}
                  <TokenBalance
                    className="text-secondary"
                    tokenAccountId={inTokenAccountId}
                    showUsd
                    balance={availableInToken}
                  />
                  )
                </span>
              }
              extraLabelRight={
                inTokenAmount &&
                inTokenAmountHuman && (
                  <TokenBalance
                    className="text-secondary"
                    tokenAccountId={inTokenAccountId}
                    showUsd
                    balance={inTokenAmount}
                  />
                )
              }
            />
          </div>
          <div className="text-center mb-2" style={{ position: "relative" }}>
            <i
              className="bi bi-arrow-down fs-3 pointer rotate-arrow"
              onClick={reverseDirection}
            />
          </div>
          <div className="mb-3">
            <TokenSelect
              id="output-token-select"
              className="token-select"
              value={outTokenAccountId}
              tokens={[...tokens]}
              tokenFilter={(tokenAccountId) =>
                tokenAccountId !== inTokenAccountId
              }
              onSelectTokenId={(v) => {
                setMaxSwapInfo(null);
                updateUrl(history, inTokenAccountId, v);
                setOutTokenAccountId(v);
              }}
            />

            <AvailableInput
              className="input-group-lg mt-1"
              value={outTokenAmountHuman}
              label="Max"
              large
              setValue={(v) => {
                setSwapInfo(null);
                setEditMode(EditMode.Output);
                setOutTokenAmountHuman(v);
              }}
              limit={availableOutTokenHuman}
              extraLabel={
                <span className="text-secondary">
                  {" ("}
                  <TokenBalance
                    className="text-secondary"
                    tokenAccountId={outTokenAccountId}
                    showUsd
                    balance={availableOutToken}
                  />
                  )
                </span>
              }
              extraLabelRight={
                outTokenAmount &&
                outTokenAmountHuman && (
                  <TokenBalance
                    className="text-secondary"
                    tokenAccountId={outTokenAccountId}
                    showUsd
                    balance={outTokenAmount}
                  />
                )
              }
            />
          </div>
        </div>
        {swapInfo && swapInfo.pool && (
          <div className="mt-3">
            <h5>Swap details</h5>
            <Rate
              title="Rate"
              hideInverse
              inTokenAccountId={swapInfo.inTokenAccountId}
              inTokenRemaining={swapInfo.amountIn}
              outTokens={[
                {
                  remaining: swapInfo.amountOut,
                  tokenAccountId: swapInfo.outTokenAccountId,
                },
              ]}
            />
            <Rate
              title="Inverse Rate"
              hideInverse
              inTokenAccountId={swapInfo.outTokenAccountId}
              inTokenRemaining={swapInfo.amountOut}
              outTokens={[
                {
                  remaining: swapInfo.amountIn,
                  tokenAccountId: swapInfo.inTokenAccountId,
                },
              ]}
            />
            <div className="left-right">
              <div>Price Impact</div>
              <div className="font-monospace">
                <span className="fw-bold">
                  <MutedDecimals value={bigToString(priceImpactDiff, 2)} />
                  {"$ "}
                </span>
                <span
                  className={
                    "text-secondary " +
                    (priceImpact.lt(-0.02)
                      ? "fw-bold text-danger"
                      : priceImpact.lt(-0.005)
                      ? "fw-bold text-warning"
                      : "")
                  }
                >
                  ({bigToString(priceImpact.mul(100), 2)}%)
                </span>
              </div>
            </div>
          </div>
        )}
        {maxSwapInfo && maxSwapInfo.pool && (
          <div className="mt-3">
            <h5>Pool details</h5>
            <div>
              <Rate
                title="Rate"
                hideInverse
                inTokenAccountId={maxSwapInfo.inTokenAccountId}
                inTokenRemaining={
                  maxSwapInfo.pool.tokens[maxSwapInfo.inTokenAccountId]
                }
                outTokens={[
                  {
                    remaining:
                      maxSwapInfo.pool.tokens[maxSwapInfo.outTokenAccountId],
                    tokenAccountId: maxSwapInfo.outTokenAccountId,
                  },
                ]}
              />
              <Rate
                title="Inverse Rate"
                hideInverse
                inTokenAccountId={maxSwapInfo.outTokenAccountId}
                inTokenRemaining={
                  maxSwapInfo.pool.tokens[maxSwapInfo.outTokenAccountId]
                }
                outTokens={[
                  {
                    remaining:
                      maxSwapInfo.pool.tokens[maxSwapInfo.inTokenAccountId],
                    tokenAccountId: maxSwapInfo.inTokenAccountId,
                  },
                ]}
              />
            </div>
            <div className="left-right">
              <div>Index</div>
              <div>#{maxSwapInfo.pool.index}</div>
            </div>
            <div className="left-right">
              <div>
                Liquidity{" "}
                <b>
                  <TokenSymbol tokenAccountId={maxSwapInfo.inTokenAccountId} />
                </b>
              </div>
              <div>
                <TokenBalance
                  clickable
                  tokenAccountId={maxSwapInfo.inTokenAccountId}
                  balance={
                    maxSwapInfo.pool.tokens[maxSwapInfo.inTokenAccountId]
                  }
                />
              </div>
            </div>
            <div className="left-right">
              <div>
                Liquidity{" "}
                <b>
                  <TokenSymbol tokenAccountId={maxSwapInfo.outTokenAccountId} />
                </b>
              </div>
              <div>
                <TokenBalance
                  clickable
                  tokenAccountId={maxSwapInfo.outTokenAccountId}
                  balance={
                    maxSwapInfo.pool.tokens[maxSwapInfo.outTokenAccountId]
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
